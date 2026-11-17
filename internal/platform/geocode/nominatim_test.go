package geocode

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/connor-davis/3reco/internal/platform/geo"
)

func TestNominatimRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		query := request.URL.Query()
		if request.URL.Path != "/search" || query.Get("q") != "private address" ||
			query.Get("countrycodes") != "za" || query.Get("format") != "jsonv2" || query.Get("limit") != "1" {
			t.Error("incorrect search parameters")
		}
		if request.Header.Get("User-Agent") != "3REco/1.0 (+https://3reco.co.za)" || query.Has("email") {
			t.Error("incorrect application identification")
		}

		fmt.Fprint(response, `[{"lat":"-33.9","lon":"18.4"}]`)
	}))
	defer server.Close()

	point, err := New(server.URL).Geocode(context.Background(), "private address")
	if err != nil || point.Lat != -33.9 || point.Lng != 18.4 {
		t.Fatalf("point = %v, error = %v", point, err)
	}
}

func TestNominatimFailures(t *testing.T) {
	for _, example := range []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{"empty", 200, `[]`, geo.ErrNotFound},
		{"unavailable", 500, ``, ErrUnavailable},
		{"limited", 429, ``, ErrUnavailable},
		{"bad json", 200, `{`, ErrUnavailable},
		{"bad latitude", 200, `[{"lat":"NaN","lon":"18"}]`, ErrUnavailable},
		{"bad longitude", 200, `[{"lat":"-33","lon":"181"}]`, ErrUnavailable},
		{"infinite", 200, `[{"lat":"-33","lon":"Inf"}]`, ErrUnavailable},
		{"not numeric", 200, `[{"lat":"hello","lon":"18"}]`, ErrUnavailable},
	} {
		t.Run(example.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
				response.WriteHeader(example.status)
				fmt.Fprint(response, example.body)
			}))
			defer server.Close()

			client := New(server.URL)
			client.limit = newLimiter(time.Millisecond)
			_, err := client.Geocode(context.Background(), "private address")
			if !errors.Is(err, example.want) || strings.Contains(err.Error(), "private") {
				t.Fatalf("error = %v", err)
			}
		})
	}
}

func TestNominatimDoesNotFollowRedirectsOrLeakTransportErrors(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("redirect was followed")
	}))
	defer target.Close()

	redirect := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		http.Redirect(response, request, target.URL, http.StatusFound)
	}))
	defer redirect.Close()

	for _, base := range []string{redirect.URL, "http://127.0.0.1:1"} {
		client := New(base)
		client.limit = newLimiter(time.Millisecond)
		_, err := client.Geocode(context.Background(), "private address")
		if err != ErrUnavailable {
			t.Fatalf("error = %v", err)
		}
	}
}

func TestNominatimSharedLimiterSpacingAndCancellation(t *testing.T) {
	var lock sync.Mutex
	var calls []time.Time
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		lock.Lock()
		calls = append(calls, time.Now())
		lock.Unlock()
		fmt.Fprint(response, `[]`)
	}))
	defer server.Close()

	first, second := New(server.URL), New(server.URL)
	if first.limit != second.limit || first.limit.interval != time.Second {
		t.Fatal("production clients do not share the one-second limiter")
	}
	limit := newLimiter(40 * time.Millisecond)
	first.limit, second.limit = limit, limit
	var wait sync.WaitGroup
	for _, client := range []*Client{first, second, first} {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, _ = client.Geocode(context.Background(), "address")
		}()
	}
	wait.Wait()

	for i := 1; i < len(calls); i++ {
		if calls[i].Sub(calls[i-1]) < 35*time.Millisecond {
			t.Fatal("requests were not spaced")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := first.Geocode(ctx, "address"); err != ErrUnavailable {
		t.Fatal("cancelled lookup was allowed")
	}
}
