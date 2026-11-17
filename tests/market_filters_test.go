package tests

import (
	"net/url"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/tests/testutil"
)

// filterWorld has a buyer at Cape Town and three sellers: one near, one far and
// one whose address could not be placed. Each sells one material at its own price.
type filterWorld struct {
	app                    *testutil.App
	buyer, near, far, none tradeUser
	glass, steel           string
	nearStock, farStock    string
	noneStock              string
}

// save sets a business's street address through the real PATCH route, so the
// geocoder runs exactly as it does for a person.
func save(t *testing.T, user tradeUser, street string) {
	t.Helper()

	status(t, user.c.Do("PATCH", "/api/business", map[string]any{"street_address": street}), 200)
}

func newFilterWorld(t *testing.T) filterWorld {
	t.Helper()

	app := testutil.Server(t)
	w := filterWorld{
		app:   app,
		buyer: tradeNewUser(t, app, "business"),
		near:  tradeNewUser(t, app, "business"),
		far:   tradeNewUser(t, app, "business"),
		none:  tradeNewUser(t, app, "business"),
	}
	w.glass = tradeMaterial(t, app, "Glass "+w.buyer.id[:6], "2")
	w.steel = tradeMaterial(t, app, "Steel "+w.buyer.id[:6], "2")

	// Cape Town, Stellenbosch (about 40 km), Johannesburg (about 1260 km).
	save(t, w.buyer, "1 Long Street @-33.9249,18.4241")
	save(t, w.near, "5 Dorp Street @-33.9321,18.8602")
	save(t, w.far, "9 Rissik Street @-26.2041,28.0473")
	save(t, w.none, "fail:nowhere")

	w.nearStock = tradeStock(t, app, w.near.id, w.glass, "10", "3.00")
	w.farStock = tradeStock(t, app, w.far.id, w.steel, "10", "5.50")
	w.noneStock = tradeStock(t, app, w.none.id, w.glass, "10", "4.25")

	return w
}

// ids lists the stock ids the buyer sees for a query string.
func (w filterWorld) ids(t *testing.T, query string) map[string]bool {
	t.Helper()

	got := map[string]bool{}
	for _, item := range pageItems(t, status(t, w.buyer.c.Do("GET", "/api/market/listings?"+query, nil), 200)) {
		got[item["id"].(string)] = true
	}

	return got
}

func (w filterWorld) want(t *testing.T, query string, stock ...string) {
	t.Helper()

	got := w.ids(t, query)
	if len(got) != len(stock) {
		t.Fatalf("%q: got %v, want %v", query, got, stock)
	}

	for _, id := range stock {
		if !got[id] {
			t.Fatalf("%q: missing %s in %v", query, id, got)
		}
	}
}

func TestMarketFiltersCombine(t *testing.T) {
	w := newFilterWorld(t)

	w.want(t, "", w.nearStock, w.farStock, w.noneStock)
	w.want(t, "material_id="+w.glass, w.nearStock, w.noneStock)
	w.want(t, "material_id="+w.steel, w.farStock)
	w.want(t, "min_price=4", w.farStock, w.noneStock)
	w.want(t, "max_price=4", w.nearStock)

	// Material and price together.
	w.want(t, "material_id="+w.glass+"&min_price=3.5", w.noneStock)
	// Price and distance together: far is out of range, none has no point.
	w.want(t, "min_price=3&max_km=100", w.nearStock)
	// All three.
	w.want(t, "material_id="+w.glass+"&max_price=3&max_km=50", w.nearStock)
	w.want(t, "material_id="+w.steel+"&max_km=100")
}

func TestMarketPriceBoundsAreInclusiveAndExact(t *testing.T) {
	w := newFilterWorld(t)

	// 3.00, 4.25 and 5.50 sit exactly on the bounds.
	w.want(t, "min_price=3.00&max_price=3.00", w.nearStock)
	w.want(t, "min_price=4.25&max_price=4.25", w.noneStock)
	w.want(t, "min_price=5.5&max_price=5.5", w.farStock)
	w.want(t, "min_price=3&max_price=5.5", w.nearStock, w.farStock, w.noneStock)
	// A hair over or under leaves the row out: no float rounding.
	w.want(t, "min_price=5.5001")
	w.want(t, "max_price=2.9999")

	for _, bad := range []string{
		"min_price=abc", "max_price=-1", "min_price=1e3", "max_price=1,5",
		"min_price=5&max_price=4", "min_price=" + url.QueryEscape("1 OR 1=1"),
	} {
		status(t, w.buyer.c.Do("GET", "/api/market/listings?"+bad, nil), 400)
	}
}

func TestMarketDistanceUsesTheFakeGeocoder(t *testing.T) {
	w := newFilterWorld(t)

	w.want(t, "max_km=10")
	w.want(t, "max_km=25")
	w.want(t, "max_km=50", w.nearStock)
	w.want(t, "max_km=100", w.nearStock)

	// The distance is a rounded whole number.
	items := pageItems(t, status(t, w.buyer.c.Do("GET", "/api/market/listings?max_km=100", nil), 200))
	if km, ok := items[0]["distance_km"].(float64); !ok || km != 40 {
		t.Fatalf("distance_km = %v, want 40", items[0]["distance_km"])
	}

	// Only the four presets are accepted.
	for _, bad := range []string{"max_km=30", "max_km=-5", "max_km=abc", "max_km=1000"} {
		status(t, w.buyer.c.Do("GET", "/api/market/listings?"+bad, nil), 400)
	}

	// Without a filter no distance is sent at all.
	for _, item := range pageItems(t, status(t, w.buyer.c.Do("GET", "/api/market/listings", nil), 200)) {
		if item["distance_km"] != nil {
			t.Fatalf("distance sent without a filter: %v", item)
		}
	}
}

func TestMarketDistanceWithoutAPoint(t *testing.T) {
	w := newFilterWorld(t)

	// A seller with no point is left out when a distance filter is on.
	if w.ids(t, "max_km=100")[w.noneStock] {
		t.Fatal("listing without a point passed the distance filter")
	}

	// A buyer whose own address could not be placed has no origin: a clear
	// refusal, and the status route says so.
	status(t, w.none.c.Do("GET", "/api/market/listings?max_km=50", nil), 400)

	st := status(t, w.none.c.Do("GET", "/api/market/distance", nil), 200).Body
	if st["enabled"] != true || st["has_origin"] != false {
		t.Fatalf("status for a buyer with no point: %v", st)
	}

	st = status(t, w.buyer.c.Do("GET", "/api/market/distance", nil), 200).Body
	if st["enabled"] != true || st["has_origin"] != true {
		t.Fatalf("status for a buyer with a point: %v", st)
	}

	// Signed out: no origin, so the filter is refused, but the plain market works.
	anon := w.app.NewClient(t)
	status(t, anon.Do("GET", "/api/market/listings?max_km=50", nil), 400)
	status(t, anon.Do("GET", "/api/market/listings", nil), 200)
}

func TestGeocodeFailureNeverBlocksASave(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	point := func() string {
		return tradeText(t, app, `SELECT COALESCE(latitude::text,'none') FROM businesses WHERE id=$1`, owner.id)
	}

	status(t, owner.c.Do("PATCH", "/api/business", map[string]any{
		"business_name": "Saved Anyway", "street_address": "fail:nowhere",
	}), 200)

	if got := tradeText(t, app, `SELECT business_name FROM businesses WHERE id=$1`, owner.id); got != "Saved Anyway" {
		t.Fatalf("save was blocked: name %q", got)
	}

	if point() != "none" {
		t.Fatalf("failed lookup left a point: %s", point())
	}

	// A good address on the next save fills it in; clearing the address clears it.
	save(t, owner, "2 Pin Road @-33.9,18.4")
	if point() == "none" {
		t.Fatal("point not set")
	}

	save(t, owner, "")
	if point() != "none" {
		t.Fatalf("point kept after the address was cleared: %s", point())
	}
}

func TestDistanceIsOffWhenNoMapServiceIsSet(t *testing.T) {
	app := testutil.Server(t, func(cfg *config.Config) { cfg.Geocoder = "off" })
	owner := tradeNewUser(t, app, "business")

	// Saving still works with the service off.
	save(t, owner, "1 Long Street @-33.9249,18.4241")

	got := tradeText(t, app, `SELECT COALESCE(latitude::text,'none') FROM businesses WHERE id=$1`, owner.id)
	if got != "none" {
		t.Fatalf("a point was set with the service off: %s", got)
	}

	st := status(t, owner.c.Do("GET", "/api/market/distance", nil), 200).Body
	if st["enabled"] != false {
		t.Fatalf("filter should be off: %v", st)
	}

	status(t, owner.c.Do("GET", "/api/market/listings?max_km=50", nil), 400)
	status(t, owner.c.Do("GET", "/api/market/listings", nil), 200)
}

func TestOtherBusinessesPointsNeverAppearInJSON(t *testing.T) {
	w := newFilterWorld(t)
	third := tradeNewUser(t, w.app, "business")
	save(t, third, "3 Secret Lane @-29.8587,31.0218")

	paths := []string{
		"/api/market/listings", "/api/market/listings?max_km=100",
		"/api/market/listings/" + w.nearStock, "/api/stores/" + w.near.id + "/listings",
		"/api/stores/" + w.near.id, "/api/market/distance",
	}

	// The buyer, a business that never traded, and a signed-out visitor all read.
	for who, client := range map[string]*testutil.Client{
		"buyer": w.buyer.c, "third": third.c, "anon": w.app.NewClient(t),
	} {
		for _, path := range paths {
			raw := string(client.Do("GET", path, nil).Raw)

			for _, leak := range []string{
				"latitude", "longitude", `"lat"`, `"lng"`, "street_address", "Dorp Street",
				"Rissik", "Secret Lane", "-33.93", "18.86", "-26.20", "28.04", "-29.85", "31.02",
			} {
				if strings.Contains(raw, leak) {
					t.Fatalf("%s reading %s saw %q in %s", who, path, leak, raw)
				}
			}
		}
	}

	// A business reading its own profile does not get a raw point either.
	raw := string(w.near.c.Do("GET", "/api/business", nil).Raw)
	if strings.Contains(raw, "latitude") || strings.Contains(raw, "longitude") {
		t.Fatalf("own profile leaks the point: %s", raw)
	}
}
