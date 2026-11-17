// Package geocode owns the Nominatim HTTP client and its process-wide request limit.
package geocode

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/platform/geo"
)

// ErrUnavailable hides transport errors, whose URLs contain private addresses.
var ErrUnavailable = errors.New("address lookup unavailable")

type limiter struct {
	gate     chan struct{}
	last     time.Time
	interval time.Duration
}

var shared = newLimiter(time.Second)

func newLimiter(interval time.Duration) *limiter {
	return &limiter{gate: make(chan struct{}, 1), interval: interval}
}

func (limit *limiter) wait(ctx context.Context) error {
	select {
	case limit.gate <- struct{}{}:
		defer func() { <-limit.gate }()
	case <-ctx.Done():
		return ErrUnavailable
	}

	timer := time.NewTimer(time.Until(limit.last.Add(limit.interval)))
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ErrUnavailable
	case <-timer.C:
		if ctx.Err() != nil {
			return ErrUnavailable
		}
		limit.last = time.Now()
		return nil
	}
}

// Client looks up saved addresses. All clients share one request limit.
type Client struct {
	base  string
	http  *http.Client
	limit *limiter
}

// New builds a short-lived, redirect-free HTTP client for the configured provider.
func New(base string) *Client {
	if base == "" {
		base = "https://nominatim.openstreetmap.org"
	}

	return &Client{base: strings.TrimRight(base, "/"), limit: shared, http: &http.Client{
		Timeout: 2 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}}
}

// Geocode restricts an address lookup to one result in South Africa.
func (client *Client) Geocode(ctx context.Context, address string) (geo.Point, error) {
	if err := client.limit.wait(ctx); err != nil {
		return geo.Point{}, err
	}

	query := url.Values{"q": {address}, "format": {"jsonv2"}, "limit": {"1"}, "countrycodes": {"za"}}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, client.base+"/search?"+query.Encode(), nil)
	if err != nil {
		return geo.Point{}, ErrUnavailable
	}
	request.Header.Set("User-Agent", "3REco/1.0 (+https://3reco.co.za)")

	response, err := client.http.Do(request)
	if err != nil {
		return geo.Point{}, ErrUnavailable
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return geo.Point{}, ErrUnavailable
	}

	var results []struct{ Lat, Lon string }
	if err := json.NewDecoder(http.MaxBytesReader(nil, response.Body, 1<<20)).Decode(&results); err != nil {
		return geo.Point{}, ErrUnavailable
	}
	if len(results) == 0 {
		return geo.Point{}, geo.ErrNotFound
	}

	lat, latErr := strconv.ParseFloat(results[0].Lat, 64)
	lng, lngErr := strconv.ParseFloat(results[0].Lon, 64)
	if latErr != nil || lngErr != nil || math.IsNaN(lat) || math.IsNaN(lng) ||
		math.IsInf(lat, 0) || math.IsInf(lng, 0) || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return geo.Point{}, ErrUnavailable
	}

	return geo.Point{Lat: lat, Lng: lng}, nil
}
