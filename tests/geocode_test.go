package tests

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/geo"
	geocodesvc "github.com/connor-davis/3reco/internal/services/geocode"
	"github.com/connor-davis/3reco/internal/stores/businesses"
	"github.com/connor-davis/3reco/tests/testutil"
)

func geocodeServer(t *testing.T, code int) (*testutil.App, *atomic.Int32) {
	t.Helper()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		calls.Add(1)
		if request.URL.Query().Get("countrycodes") != "za" {
			t.Error("lookup not restricted to South Africa")
		}
		response.WriteHeader(code)
		fmt.Fprint(response, `[{"lat":"-33.9","lon":"18.4"}]`)
	}))
	t.Cleanup(server.Close)

	app := testutil.Server(t, func(cfg *config.Config) {
		cfg.Geocoder, cfg.GeocoderURL = "nominatim", server.URL
	})

	return app, &calls
}

func businessPoint(t *testing.T, app *testutil.App, id string) string {
	t.Helper()
	return tradeText(t, app, `SELECT COALESCE(latitude::text,'none') FROM businesses WHERE id=$1`, id)
}

func TestNominatimSaveAndNormalizedCache(t *testing.T) {
	app, calls := geocodeServer(t, 200)
	first, second := tradeNewUser(t, app, "business"), tradeNewUser(t, app, "business")
	save(t, first, "  1 LONG   Street  ")
	save(t, second, "1 long street")
	if calls.Load() != 1 || businessPoint(t, app, first.id) != "-33.9" || businessPoint(t, app, second.id) != "-33.9" {
		t.Fatalf("calls=%d; points=%s,%s", calls.Load(), businessPoint(t, app, first.id), businessPoint(t, app, second.id))
	}

	status(t, first.c.Do("GET", "/api/market/listings?max_km=10", nil), 200)
	save(t, first, "")
	if businessPoint(t, app, first.id) != "none" {
		t.Fatal("clearing address kept its point")
	}
}

func TestNominatimFailureIsCachedForADay(t *testing.T) {
	app, calls := geocodeServer(t, 500)
	owner := tradeNewUser(t, app, "business")
	tradeExec(t, app, `UPDATE businesses SET street_address='old address',
		latitude=-33.9,longitude=18.4 WHERE id=$1`, owner.id)
	save(t, owner, "1 Failed Street")
	save(t, owner, "1 Failed Street")
	if calls.Load() != 1 || businessPoint(t, app, owner.id) != "none" {
		t.Fatal("failed save was placed or repeated")
	}
	if got := tradeText(t, app, `SELECT street_address FROM businesses WHERE id=$1`, owner.id); got != "1 Failed Street" {
		t.Fatal("address was not saved")
	}

	tradeExec(t, app, `UPDATE geocode_cache SET looked_up_at=now()-interval '25 hours'`)
	save(t, owner, "1 Failed Street")
	if calls.Load() != 2 {
		t.Fatal("old failure was not retried")
	}
}

func TestNominatimOtherUserCannotTriggerLookup(t *testing.T) {
	app, calls := geocodeServer(t, 200)
	owner, other := tradeNewUser(t, app, "business"), tradeNewUser(t, app, "business")
	manager := tenantMember(t, app, owner.id, "manager")
	status(t, manager.c.Do("PATCH", "/api/business", map[string]any{
		"street_address": "1 Private Street",
	}), 403)
	status(t, other.c.Do("PATCH", "/api/business", map[string]any{
		"id": owner.id, "street_address": "1 Private Street",
	}), 400)
	status(t, app.NewClient(t).Do("PATCH", "/api/business", map[string]any{
		"street_address": "1 Private Street",
	}), 401)
	if calls.Load() != 0 || businessPoint(t, app, owner.id) != "none" {
		t.Fatal("unauthorized lookup occurred")
	}
}

func TestNominatimConditionalPointDoesNotOverwriteChangedAddress(t *testing.T) {
	app, _ := geocodeServer(t, 200)
	owner := tradeNewUser(t, app, "business")
	records := businesses.New(app.DB)
	tradeExec(t, app, `UPDATE businesses SET street_address='old address' WHERE id=$1`, owner.id)
	old, err := records.FindProfile(context.Background(), owner.id, false)
	if err != nil {
		t.Fatal(err)
	}
	tradeExec(t, app, `UPDATE businesses SET street_address='new address' WHERE id=$1`, owner.id)
	if err := records.SetPoint(context.Background(), old, geo.Point{Lat: -33.9, Lng: 18.4}); err != nil {
		t.Fatal(err)
	}
	if businessPoint(t, app, owner.id) != "none" {
		t.Fatal("old address overwrote the new address's point")
	}
}

func TestNominatimDemoAndOffMakeNoCalls(t *testing.T) {
	app, calls := geocodeServer(t, 200)
	owner := tradeNewUser(t, app, "business")
	tradeExec(t, app, `UPDATE businesses SET street_address='1 Backfill Road' WHERE id=$1`, owner.id)
	for _, mode := range []string{"off", "demo"} {
		cfg := app.Config
		cfg.Demo = mode == "demo"
		if mode == "off" {
			cfg.Geocoder = "off"
		}
		service := geocodesvc.New(cfg, app.DB, businesses.New(app.DB))
		service.Backfill(context.Background())
		if _, err := service.Lookup(context.Background(), "1 Backfill Road"); err != geo.ErrDisabled {
			t.Fatal("off/demo lookup enabled")
		}
	}
	if calls.Load() != 0 {
		t.Fatal("off/demo made an HTTP request")
	}
}

func TestNominatimStartupBackfillFillsMissingPoint(t *testing.T) {
	app, calls := geocodeServer(t, 200)
	owner := tradeNewUser(t, app, "business")
	tradeExec(t, app, `UPDATE businesses SET street_address='1 Backfill Road' WHERE id=$1`, owner.id)
	deadline := time.NewTimer(18 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()

	for {
		select {
		case <-deadline.C:
			t.Fatal("startup backfill did not fill the point")
		case <-tick.C:
			if businessPoint(t, app, owner.id) != "none" {
				if calls.Load() != 1 {
					t.Fatal("backfill repeated the query")
				}
				return
			}
		}
	}
}
