// Package geocode caches business address lookups and backfills missing points.
package geocode

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/geo"
	provider "github.com/connor-davis/3reco/internal/platform/geocode"
	"github.com/connor-davis/3reco/internal/stores/businesses"
	cache "github.com/connor-davis/3reco/internal/stores/geocode"
)

// Service shares the provider, cache and in-flight lookup lock.
type Service struct {
	client     geo.Geocoder
	cache      *cache.Store
	businesses *businesses.Store
	gate       chan struct{}
	enabled    bool
}

// New selects an offline provider unless Nominatim is explicitly enabled.
func New(cfg config.Config, db *database.DB, records *businesses.Store) *Service {
	client := geo.FromName(cfg.Geocoder, cfg.Dev)
	if strings.EqualFold(strings.TrimSpace(cfg.Geocoder), "nominatim") {
		client = provider.New(cfg.GeocoderURL)
	}
	if cfg.Demo {
		client = geo.FromName("off", false)
	}

	return &Service{
		client: client, cache: cache.New(db), businesses: records,
		enabled: geo.Enabled(client), gate: make(chan struct{}, 1),
	}
}

// Enabled reports whether address lookup is configured and permitted.
func (service *Service) Enabled() bool { return service.enabled }

// Address joins the saved fields into the stable query used by the cache.
func Address(item businesses.Profile) string {
	if strings.TrimSpace(item.StreetAddress) == "" {
		return ""
	}

	parts := []string{item.StreetAddress, item.City}
	if item.AreaCode != nil {
		parts = append(parts, strconv.Itoa(*item.AreaCode))
	}
	parts = append(parts, item.Province, "south africa")

	var kept []string
	for _, part := range parts {
		if part = strings.Join(strings.Fields(strings.ToLower(part)), " "); part != "" {
			kept = append(kept, part)
		}
	}

	return strings.Join(kept, ", ")
}

// Lookup reuses successes forever and retries unsuccessful queries after 24 hours.
func (service *Service) Lookup(ctx context.Context, address string) (geo.Point, error) {
	if !service.enabled {
		return geo.Point{}, geo.ErrDisabled
	}
	// Offline development points must never enter the real provider's cache.
	if _, fake := service.client.(geo.Fake); fake {
		return service.client.Geocode(ctx, address)
	}

	address = strings.Join(strings.Fields(strings.ToLower(address)), " ")
	if address == "" {
		return geo.Point{}, geo.ErrNotFound
	}

	select {
	case service.gate <- struct{}{}:
		defer func() { <-service.gate }()
	case <-ctx.Done():
		return geo.Point{}, provider.ErrUnavailable
	}

	result, err := service.cache.Get(ctx, address)
	if err == nil {
		if result.Found {
			return geo.Point{Lat: *result.Lat, Lng: *result.Lng}, nil
		}
		if time.Since(result.LookedUpAt) < 24*time.Hour {
			return geo.Point{}, geo.ErrNotFound
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return geo.Point{}, provider.ErrUnavailable
	}

	point, lookupErr := service.client.Geocode(ctx, address)
	var lat, lng *float64
	if lookupErr == nil {
		lat, lng = &point.Lat, &point.Lng
	}

	// Keep failures even when the provider exhausted the lookup deadline.
	write, cancel := context.WithTimeout(context.WithoutCancel(ctx), time.Second)
	defer cancel()
	if err := service.cache.Put(write, address, lat, lng, lookupErr == nil); err != nil {
		return geo.Point{}, provider.ErrUnavailable
	}

	return point, lookupErr
}

// Geocode implements the distance filter's existing provider interface.
func (service *Service) Geocode(ctx context.Context, address string) (geo.Point, error) {
	return service.Lookup(ctx, address)
}

// Place fills a missing point only while the saved address still matches.
func (service *Service) Place(ctx context.Context, item businesses.Profile) {
	if Address(item) == "" || item.Lat != nil || !service.enabled {
		return
	}

	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	point, err := service.Lookup(ctx, Address(item))
	if err == nil {
		_ = service.businesses.SetPoint(ctx, item, point)
	}
}

// Backfill visits each missing business once, with at most four lookups per minute.
func (service *Service) Backfill(ctx context.Context) {
	if !service.enabled {
		return
	}
	tick := time.NewTimer(15 * time.Second)
	defer tick.Stop()
	var after string

	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			for {
				item, err := service.businesses.MissingPoint(ctx, after)
				if err != nil {
					return
				}
				after = item.ID

				result, err := service.cache.Get(ctx, Address(item))
				if err == nil && !result.Found && time.Since(result.LookedUpAt) < 24*time.Hour {
					continue
				}

				service.Place(ctx, item)
				// Wait after completion too, so a busy shared limiter cannot bunch requests.
				tick.Reset(15 * time.Second)
				break
			}
		}
	}
}
