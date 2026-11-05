package tests

import (
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

func tradeDash(t *testing.T, u tradeUser, path string) map[string]any {
	t.Helper()

	res := u.c.Do("GET", path, nil)
	tradeWant(t, path, res, 200)

	return res.Body
}

func TestDashboardAccess(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	collector := tradeNewUser(t, w.app, "collector")
	anon := w.app.NewClient(t)

	tradeWant(t, "admin dashboard", admin.c.Do("GET", "/api/admin/dashboard", nil), 200)
	tradeWant(t, "staff dashboard", staff.c.Do("GET", "/api/admin/dashboard", nil), 200)
	tradeWant(t, "business admin dashboard", w.buyer.c.Do("GET", "/api/admin/dashboard", nil), 403)
	tradeWant(t, "collector admin dashboard", collector.c.Do("GET", "/api/admin/dashboard", nil), 403)

	tradeWant(t, "business dashboard", w.buyer.c.Do("GET", "/api/dashboard/business", nil), 200)
	tradeWant(t, "collector on business", collector.c.Do("GET", "/api/dashboard/business", nil), 403)
	tradeWant(t, "admin on business", admin.c.Do("GET", "/api/dashboard/business", nil), 403)

	tradeWant(t, "collector dashboard", collector.c.Do("GET", "/api/dashboard/collector", nil), 200)
	tradeWant(t, "business on collector", w.buyer.c.Do("GET", "/api/dashboard/collector", nil), 403)

	for _, p := range []string{"/api/admin/dashboard", "/api/dashboard/business", "/api/dashboard/collector"} {
		tradeWant(t, "anonymous "+p, anon.Do("GET", p, nil), 401)
	}

	tradeWant(t, "bad date", w.buyer.c.Do("GET", "/api/dashboard/business?from=soon", nil), 400)
	tradeWant(t, "backwards", w.buyer.c.Do("GET",
		"/api/dashboard/business?from=2026-03-05&to=2026-03-01", nil), 400)
	tradeWant(t, "too long", w.buyer.c.Do("GET",
		"/api/dashboard/business?from=2020-01-01&to=2026-01-01", nil), 400)

	// Nothing traded: the default window is 30 days of zeros.
	body := tradeDash(t, w.buyer, "/api/dashboard/business")
	if series, _ := body["series"].([]any); len(series) != 30 {
		t.Errorf("default series has %d days, want 30", len(series))
	}

	// The collector with no linked row sees zeros and is told so.
	body = tradeDash(t, collector, "/api/dashboard/collector")
	if body["collector_linked"] != false {
		t.Errorf("collector_linked %v, want false", body["collector_linked"])
	}
}

// Hole 13: a purchase names its seller and a sale names its buyer.
func TestBusinessDashboardCounterparty(t *testing.T) {
	w := newTradeWorld(t)
	third := tradeNewUser(t, w.app, "business")

	// buyer buys from seller, then sells part of it on to third.
	tradeSale(t, w.seller, w.buyer, w.material, "20", "8")
	tradeSale(t, w.buyer, third, w.material, "5", "9")

	body := tradeDash(t, w.buyer, "/api/dashboard/business")
	names := map[string]string{}

	cps, _ := body["counterparties"].([]any)
	for _, c := range cps {
		row, _ := c.(map[string]any)
		names[row["id"].(string)], _ = row["name"].(string)
	}

	if len(names) != 2 {
		t.Fatalf("counterparties %v, want the seller and the third business", names)
	}

	if names[w.seller.id] != "Biz "+w.seller.id[:6] {
		t.Errorf("purchase counterparty %q, want the seller's name", names[w.seller.id])
	}

	if names[third.id] != "Biz "+third.id[:6] {
		t.Errorf("sale counterparty %q, want the buyer's name", names[third.id])
	}

	if _, own := names[w.buyer.id]; own {
		t.Errorf("the business is listed as its own counterparty")
	}

	totals, _ := body["totals"].(map[string]any)
	if totals["count"] != float64(2) {
		t.Errorf("totals %v, want 2 trades", totals)
	}

	// The third business sees only its own trade, with the seller as counterparty.
	other := tradeDash(t, third, "/api/dashboard/business")
	if t2, _ := other["totals"].(map[string]any); t2["count"] != float64(1) {
		t.Errorf("third business totals %v, want 1 trade", t2)
	}
}

// tradeOldSale inserts a collector sale with exact times, so the day it falls
// on can be checked.
func tradeOldSale(
	t *testing.T,
	app *testutil.App,
	collector string,
	buyer tradeUser,
	material, createdAt string,
	collectionDate, collectionDay *string,
) {
	t.Helper()

	id := database.NewID()

	tradeExec(t, app, `
		INSERT INTO transactions
			(id, seller_id, buyer_id, type, total_price, collection_date, collection_day, created_at)
		VALUES ($1, $2, $3, 'c2b', 60, $4::timestamptz, $5::date, $6::timestamptz)`,
		id, collector, buyer.id, collectionDate, collectionDay, createdAt)
	tradeExec(t, app, `
		INSERT INTO transaction_items (transaction_id, position, material_id, weight, price)
		VALUES ($1, 0, $2, 10, 6)`, id, material)
}

// Hole 18: days are South African days, from midnight to midnight.
func TestDashboardSASTDayBounds(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000018")

	str := func(s string) *string { return &s }

	// 22:30 UTC on 1 March is 00:30 on 2 March in South Africa.
	tradeOldSale(t, w.app, collector, w.buyer, w.material, "2026-03-01T10:00:00Z",
		str("2026-03-01T22:30:00Z"), nil)
	// Exactly midnight in South Africa starts 2 March.
	tradeOldSale(t, w.app, collector, w.buyer, w.material, "2026-03-01T10:00:00Z",
		str("2026-03-01T22:00:00Z"), nil)
	// One minute earlier is still 1 March.
	tradeOldSale(t, w.app, collector, w.buyer, w.material, "2026-03-01T10:00:00Z",
		str("2026-03-01T21:59:00Z"), nil)
	// A collection day counts on that date whatever the created time says.
	tradeOldSale(t, w.app, collector, w.buyer, w.material, "2026-03-01T10:00:00Z",
		nil, str("2026-03-05"))

	day := func(series []any, date string) map[string]any {
		for _, s := range series {
			row, _ := s.(map[string]any)
			if row["day"] == date {
				return row
			}
		}

		t.Fatalf("series has no day %s", date)

		return nil
	}

	body := tradeDash(t, w.buyer, "/api/dashboard/business?from=2026-03-01&to=2026-03-05")
	series, _ := body["series"].([]any)

	if len(series) != 5 {
		t.Fatalf("series has %d days, want 5", len(series))
	}

	want := map[string]float64{
		"2026-03-01": 1, "2026-03-02": 2, "2026-03-03": 0, "2026-03-04": 0, "2026-03-05": 1,
	}
	for date, n := range want {
		if got := day(series, date)["count"]; got != n {
			t.Errorf("%s holds %v trades, want %v", date, got, n)
		}
	}

	if got := day(series, "2026-03-03")["value"]; got != "0" {
		t.Errorf("an empty day has value %v, want the string 0", got)
	}

	totals, _ := body["totals"].(map[string]any)
	if totals["count"] != float64(4) || totals["value"] != "240.00" ||
		totals["weight"] != "40.000" || totals["carbon_savings"] != "80.000" {
		t.Errorf("totals %v, want 4 trades, 240.00, 40.000 kg and 80.000 carbon", totals)
	}

	// A single day takes exactly that South African day.
	one := tradeDash(t, w.buyer, "/api/dashboard/business?from=2026-03-02&to=2026-03-02")
	if t1, _ := one["totals"].(map[string]any); t1["count"] != float64(2) {
		t.Errorf("2 March totals %v, want 2 trades", t1)
	}

	// The admin sees the same trades.
	admin := tradeNewUser(t, w.app, "admin")
	all := tradeDash(t, admin, "/api/admin/dashboard?from=2026-03-01&to=2026-03-05")

	if ta, _ := all["totals"].(map[string]any); ta["count"] != float64(4) {
		t.Errorf("admin totals %v, want 4 trades", ta)
	}

	if users, _ := all["users"].([]any); len(users) == 0 {
		t.Errorf("admin dashboard has no user counts")
	}
}

func TestCollectorDashboardOwnTradesOnly(t *testing.T) {
	w := newTradeWorld(t)
	mine := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, mine.phone)
	other := tradeCollector(t, w.app, w.buyer, "+27800000019")

	line := tradeLine(w.material, "10", "6")
	tradeWant(t, "mine", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", line)), 200)
	tradeWant(t, "other", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(other, "", line)), 200)

	body := tradeDash(t, mine, "/api/dashboard/collector")
	totals, _ := body["totals"].(map[string]any)

	if totals["count"] != float64(1) || totals["value"] != "60.00" {
		t.Errorf("collector totals %v, want 1 trade worth 60.00", totals)
	}

	if body["collector_linked"] != true {
		t.Errorf("collector_linked %v, want true", body["collector_linked"])
	}
}
