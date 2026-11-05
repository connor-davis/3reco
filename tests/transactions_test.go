package tests

import (
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

// tradeCollector inserts a collector row and returns its id.
func tradeCollector(t *testing.T, app *testutil.App, by tradeUser, phone string) string {
	t.Helper()

	id := database.NewID()

	tradeExec(t, app, `
		INSERT INTO collectors (id, name, phone, normalized_phone, created_by_user_id)
		VALUES ($1, 'Thandi Collector', $2, $2, $3)`, id, phone, by.id)

	return id
}

func tradeCollection(collector, business string, items ...map[string]any) map[string]any {
	body := map[string]any{"collector_id": collector, "items": items}
	if business != "" {
		body["business_id"] = business
	}

	return body
}

func TestCollectorSaleAndDirectSale(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000001")

	res := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "30", "6")))
	tradeWant(t, "collection", res, 200)

	txID, _ := res.Body["transaction_id"].(string)
	if got := tradeStockWeight(t, w.app, w.buyer.id, w.material); got != "30.000000" && got != "30" {
		t.Errorf("buyer stock %s after the collection, want 30", got)
	}

	if got := tradeText(t, w.app, `SELECT type || ':' || total_price::text FROM transactions WHERE id = $1`, txID); !strings.HasPrefix(got, "c2b:180") {
		t.Errorf("collection row %q, want c2b with total 180", got)
	}

	// A business sale moves stock from the seller to the buyer.
	sale := tradeSale(t, w.seller, w.buyer, w.material, "25", "8")

	if got := tradeText(t, w.app, `SELECT seller_id FROM transactions WHERE id = $1`, sale); got != w.seller.id {
		t.Errorf("sale seller %s, want the signed-in seller", got)
	}

	if got := tradeStockWeight(t, w.app, w.seller.id, w.material); got != "75.000000" && got != "75" {
		t.Errorf("seller stock %s, want 75", got)
	}

	if got := tradeStockWeight(t, w.app, w.buyer.id, w.material); got != "55.000000" && got != "55" {
		t.Errorf("buyer stock %s, want 55", got)
	}

	// Selling more than is held changes nothing.
	tooMuch := w.seller.c.Do("POST", "/api/transactions/sales", map[string]any{
		"business_id": w.buyer.id, "items": []map[string]any{tradeLine(w.material, "500", "8")},
	})
	if tooMuch.Status < 400 || tooMuch.Status >= 500 {
		t.Errorf("oversell: %d, want a 4xx: %s", tooMuch.Status, tooMuch.Raw)
	}

	if got := tradeStockWeight(t, w.app, w.seller.id, w.material); got != "75.000000" && got != "75" {
		t.Errorf("seller stock %s after a failed sale, want 75", got)
	}

	// The detail shows items and no private contact data.
	detail := w.buyer.c.Do("GET", "/api/transactions/"+sale, nil)
	tradeWant(t, "detail", detail, 200)

	if n := len(tradeItems(detail)); n != 1 {
		t.Errorf("detail holds %d items, want 1", n)
	}

	for _, secret := range []string{w.seller.email, w.seller.phone} {
		if strings.Contains(string(detail.Raw), secret) {
			t.Errorf("detail leaks %q", secret)
		}
	}
}

// Hole 10: only a business sells, the seller is the caller, the buyer must be
// a real business, and the answer holds none of the buyer's private data.
func TestDirectSaleRoleAndBuyerLeak(t *testing.T) {
	w := newTradeWorld(t)
	collectorUser := tradeNewUser(t, w.app, "collector")
	staff := tradeNewUser(t, w.app, "staff")
	anon := w.app.NewClient(t)

	sale := func(buyer string) map[string]any {
		return map[string]any{
			"business_id": buyer, "items": []map[string]any{tradeLine(w.material, "1", "8")},
		}
	}

	tradeWant(t, "collector sells", collectorUser.c.Do("POST", "/api/transactions/sales", sale(w.buyer.id)), 403)
	tradeWant(t, "staff sells", staff.c.Do("POST", "/api/transactions/sales", sale(w.buyer.id)), 403)
	tradeWant(t, "anonymous sells", anon.Do("POST", "/api/transactions/sales", sale(w.buyer.id)), 401)
	tradeWant(t, "sell to self", w.seller.c.Do("POST", "/api/transactions/sales", sale(w.seller.id)), 400)
	tradeWant(t, "sell to a collector", w.seller.c.Do("POST", "/api/transactions/sales", sale(collectorUser.id)), 400)
	tradeWant(t, "sell to nobody", w.seller.c.Do("POST", "/api/transactions/sales", sale("nobody")), 400)

	below := map[string]any{
		"business_id": w.buyer.id, "items": []map[string]any{tradeLine(w.material, "1", "1")},
	}
	tradeWant(t, "below base price", w.seller.c.Do("POST", "/api/transactions/sales", below), 400)

	// A forged seller id in the body is ignored: the seller is the session.
	forged := sale(w.buyer.id)
	forged["seller_id"] = w.buyer.id
	res := w.seller.c.Do("POST", "/api/transactions/sales", forged)
	tradeWant(t, "forged seller", res, 200)

	if got := tradeText(t, w.app, `SELECT seller_id FROM transactions WHERE id = $1`, res.Body["transaction_id"]); got != w.seller.id {
		t.Errorf("seller %s, want the caller %s", got, w.seller.id)
	}

	for _, secret := range []string{w.buyer.email, w.buyer.phone} {
		if strings.Contains(string(res.Raw), secret) {
			t.Errorf("sale answer leaks %q", secret)
		}
	}

	// A removed business cannot be sold to.
	tradeExec(t, w.app, `UPDATE users SET is_removed = true WHERE id = $1`, w.buyer.id)
	tradeWant(t, "sell to removed", w.seller.c.Do("POST", "/api/transactions/sales", sale(w.buyer.id)), 400)
}

// Hole 16: a sale needs items, and every weight must be above zero.
func TestSalesRejectZeroWeightAndEmptyItems(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000002")

	bad := map[string][]map[string]any{
		"no items":        {},
		"zero weight":     {tradeLine(w.material, "0", "8")},
		"negative weight": {tradeLine(w.material, "-2", "8")},
		"negative price":  {tradeLine(w.material, "1", "-8")},
		"not a number":    {tradeLine(w.material, "abc", "8")},
		"duplicate":       {tradeLine(w.material, "1", "8"), tradeLine(w.material, "1", "8")},
		"unknown":         {tradeLine("nope", "1", "8")},
	}

	for name, items := range bad {
		sale := w.seller.c.Do("POST", "/api/transactions/sales",
			map[string]any{"business_id": w.buyer.id, "items": items})
		tradeWant(t, "sale: "+name, sale, 400)

		coll := w.buyer.c.Do("POST", "/api/transactions/collections", map[string]any{
			"collector_id": collector, "items": items,
		})
		tradeWant(t, "collection: "+name, coll, 400)
	}

	if n := tradeText(t, w.app, `SELECT count(*)::text FROM transactions`); n != "0" {
		t.Errorf("%s transactions after bad sales, want 0", n)
	}

	unknown := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection("nobody", "", tradeLine(w.material, "1", "8")))
	tradeWant(t, "unknown collector", unknown, 404)

	// Staff must say which business buys; a seller-only role may not collect.
	staff := tradeNewUser(t, w.app, "staff")
	line := tradeLine(w.material, "1", "8")
	tradeWant(t, "staff with no business", staff.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", line)), 400)
	tradeWant(t, "staff for a business", staff.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, w.buyer.id, line)), 200)

	collectorUser := tradeNewUser(t, w.app, "collector")
	tradeWant(t, "collector collects", collectorUser.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, w.buyer.id, line)), 403)
	tradeWant(t, "anonymous collects", w.app.NewClient(t).Do("POST", "/api/transactions/collections",
		tradeCollection(collector, w.buyer.id, line)), 401)
}

// Hole 12: a collector's sales are found through the linked collector row,
// not by comparing the user id to the seller id.
func TestCollectorSalesResolveCollectorID(t *testing.T) {
	w := newTradeWorld(t)
	mine := tradeNewUser(t, w.app, "collector")
	stranger := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, mine.phone)
	other := tradeCollector(t, w.app, w.buyer, "+27800000003")

	line := tradeLine(w.material, "10", "6")
	tradeWant(t, "mine", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", line)), 200)
	tradeWant(t, "other", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(other, "", line)), 200)

	got := mine.c.Do("GET", "/api/transactions/sales", nil)
	tradeWant(t, "collector sales", got, 200)

	items := tradeItems(got)
	if len(items) != 1 {
		t.Fatalf("collector sees %d sales, want 1: %s", len(items), got.Raw)
	}

	row, _ := items[0].(map[string]any)
	if row["type"] != "c2b" {
		t.Errorf("sale type %v, want c2b", row["type"])
	}

	// A collector user with no linked collector row sees nothing, not everything.
	if n := len(tradeItems(stranger.c.Do("GET", "/api/transactions/sales", nil))); n != 0 {
		t.Errorf("unlinked collector sees %d sales, want 0", n)
	}

	// The buyer is a business, so it cannot use the collector's dashboard route.
	tradeWant(t, "business on collector dashboard", w.buyer.c.Do("GET", "/api/dashboard/collector", nil), 403)
}

// Hole 11: every list is limited to what the caller may see.
func TestTransactionListsLeak(t *testing.T) {
	w := newTradeWorld(t)
	third := tradeNewUser(t, w.app, "business")
	collectorUser := tradeNewUser(t, w.app, "collector")
	staff := tradeNewUser(t, w.app, "staff")
	anon := w.app.NewClient(t)

	tradeSale(t, w.seller, w.buyer, w.material, "5", "8")

	count := func(u tradeUser, path string) int { return len(tradeItems(u.c.Do("GET", path, nil))) }

	if n := count(w.buyer, "/api/transactions/purchases"); n != 1 {
		t.Errorf("buyer purchases %d, want 1", n)
	}

	if n := count(w.seller, "/api/transactions/sales"); n != 1 {
		t.Errorf("seller sales %d, want 1", n)
	}

	if n := count(w.seller, "/api/transactions/purchases"); n != 0 {
		t.Errorf("seller purchases %d, want 0", n)
	}

	if n := count(w.buyer, "/api/transactions/sales"); n != 0 {
		t.Errorf("buyer sales %d, want 0", n)
	}

	for _, path := range []string{"/api/transactions", "/api/transactions/purchases", "/api/transactions/sales"} {
		if n := count(third, path); n != 0 {
			t.Errorf("outsider %s holds %d rows", path, n)
		}

		if n := len(tradeItems(third.c.Do("GET", path+"?all=true", nil))); n != 0 {
			t.Errorf("outsider %s?all=true holds %d rows", path, n)
		}

		tradeWant(t, "anonymous "+path, anon.Do("GET", path, nil), 401)
	}

	// Roles that have no such list are refused, not given an empty or full one.
	tradeWant(t, "collector purchases", collectorUser.c.Do("GET", "/api/transactions/purchases", nil), 403)
	tradeWant(t, "staff purchases", staff.c.Do("GET", "/api/transactions/purchases", nil), 403)
	tradeWant(t, "staff sales", staff.c.Do("GET", "/api/transactions/sales", nil), 403)

	// Staff see everything through the plain list; participants see their own.
	if n := count(staff, "/api/transactions"); n != 1 {
		t.Errorf("staff list %d, want 1", n)
	}

	if n := count(w.buyer, "/api/transactions"); n != 1 {
		t.Errorf("buyer list %d, want 1", n)
	}

	if n := count(collectorUser, "/api/transactions"); n != 0 {
		t.Errorf("collector list %d, want 0", n)
	}
}
