package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// hiddenWorld is an unverified business with one listed stock row, a buyer, an
// admin and a stranger.
type hiddenWorld struct {
	app                          *testutil.App
	seller, buyer, admin, anyone tradeUser
	material, stock              string
}

func newHiddenWorld(t *testing.T) hiddenWorld {
	t.Helper()

	app := testutil.Server(t)
	w := hiddenWorld{
		app:    app,
		seller: tradeNewUnverified(t, app),
		buyer:  tradeNewUser(t, app, "business"),
		admin:  tradeNewUser(t, app, "admin"),
		anyone: tradeNewUser(t, app, "business"),
	}
	w.material = tradeMaterial(t, app, "Glass "+w.seller.id[:6], "2")
	w.stock = tradeStock(t, app, w.seller.id, w.material, "10", "3")

	return w
}

func (w hiddenWorld) verify(t *testing.T, verified bool) {
	t.Helper()

	tradeWant(t, "verify", w.admin.c.Do("PUT", "/api/admin/users/"+w.seller.id+"/business-verification",
		map[string]any{"verified": verified}), 200)
}

func hasID(items []map[string]any, id string) bool {
	for _, item := range items {
		if item["id"] == id || item["seller_id"] == id {
			return true
		}
	}

	return false
}

func TestUnverifiedBusinessIsHiddenFromTheMarket(t *testing.T) {
	w := newHiddenWorld(t)
	anon := w.app.NewClient(t)

	for name, c := range map[string]*testutil.Client{"anonymous": anon, "other business": w.buyer.c} {
		if hasID(pageItems(t, status(t, c.Do("GET", "/api/market/listings", nil), 200)), w.stock) {
			t.Errorf("%s sees the listing", name)
		}

		if len(pageItems(t, status(t, c.Do("GET", "/api/stores/"+w.seller.id+"/listings", nil), 200))) != 0 {
			t.Errorf("%s sees the store listings", name)
		}

		if hasID(pageItems(t, status(t, c.Do("GET", "/api/stores", nil), 200)), w.seller.id) {
			t.Errorf("%s sees the store in the list", name)
		}

		status(t, c.Do("GET", "/api/market/listings/"+w.stock, nil), 404)
		status(t, c.Do("GET", "/api/stores/"+w.seller.id, nil), 404)
	}

	// The owner still sees their own stock and store.
	own := w.seller.c
	if !hasID(pageItems(t, status(t, own.Do("GET", "/api/stores/"+w.seller.id+"/listings", nil), 200)), w.stock) {
		t.Error("owner cannot see own listing")
	}

	status(t, own.Do("GET", "/api/market/listings/"+w.stock, nil), 200)
	status(t, own.Do("GET", "/api/stores/"+w.seller.id, nil), 200)

	// The admin still sees the business in the user list.
	users := status(t, w.admin.c.Do("GET", "/api/admin/users?q="+w.seller.email, nil), 200)
	if !hasID(pageItems(t, users), w.seller.id) {
		t.Errorf("admin lost the business: %s", users.Raw)
	}

	// Verifying brings it back everywhere, and the flag shows on the rows.
	w.verify(t, true)

	got := status(t, w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200).Body
	if got["seller_verified"] != true {
		t.Errorf("flag not set: %v", got)
	}

	if store := status(t, anon.Do("GET", "/api/stores/"+w.seller.id, nil), 200).Body; store["business_verified"] != true {
		t.Errorf("store flag not set: %v", store)
	}

	if !hasID(pageItems(t, status(t, w.buyer.c.Do("GET", "/api/stores", nil), 200)), w.seller.id) {
		t.Error("verified store missing from the list")
	}

	w.verify(t, false)
	status(t, w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 404)
}

func TestUnverifiedBusinessIsNotATopStore(t *testing.T) {
	w := newHiddenWorld(t)
	tradeSale(t, w.seller, w.buyer, w.material, "2", "3")

	top := func() bool {
		stats := status(t, w.anyone.c.Do("GET", "/api/stats", nil), 200).Body
		list, _ := stats["top_stores"].([]any)

		for _, row := range list {
			if row.(map[string]any)["id"] == w.seller.id {
				return true
			}
		}

		return false
	}

	if top() {
		t.Fatal("unverified business is a top store")
	}

	w.verify(t, true)

	if !top() {
		t.Fatal("verified business is not a top store")
	}
}

func TestUnverifiedBusinessCannotBeBoughtFrom(t *testing.T) {
	w := newHiddenWorld(t)
	line := map[string]any{"stock_id": w.stock, "material_id": w.material, "weight": "1"}

	tradeWant(t, "cart", cartPut(w.buyer, w.seller, line), 403)
	tradeWant(t, "request", w.buyer.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.seller.id,
		"items":     []map[string]any{{"stock_id": w.stock, "weight": "1"}},
	}), 403)

	// An offer and an accept stop when verification is lost mid-way. Cancel stays open.
	w.verify(t, true)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, id, w.material, "1", "3")
	w.verify(t, false)

	tradeWant(t, "offer", w.seller.c.Do("POST", "/api/requests/"+id+"/offer", map[string]any{
		"items": []map[string]any{tradeLine(w.material, "1", "4")},
	}), 403)
	tradeWant(t, "accept", w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 403)

	// A stranger still gets a 404 on the request, as before.
	tradeWant(t, "stranger", w.anyone.c.Do("POST", "/api/requests/"+id+"/accept", nil), 404)
}

func TestTradeBusinessVerifiedColumnFlips(t *testing.T) {
	w := newHiddenWorld(t)
	tradeSale(t, w.seller, w.buyer, w.material, "2", "3")

	last := func(c *testutil.Client, path string) string {
		rows := csvRows(t, c, path)
		if len(rows) != 2 {
			t.Fatalf("%s rows: %d", path, len(rows))
		}

		if rows[0][len(rows[0])-1] != "Business verified" {
			t.Fatalf("%s header: %v", path, rows[0])
		}

		return rows[1][len(rows[1])-1]
	}

	// A business trade is decided by the seller.
	if got := last(w.seller.c, "/api/exports/sales"); got != "Unverified" {
		t.Errorf("before: %q", got)
	}

	w.verify(t, true)

	if got := last(w.seller.c, "/api/exports/sales"); got != "Verified" {
		t.Errorf("after: %q", got)
	}

	if got := last(w.admin.c, "/api/admin/exports/transactions"); got != "Verified" {
		t.Errorf("admin: %q", got)
	}

	// Someone else's trades never show up in another business's export.
	if rows := csvRows(t, w.anyone.c, "/api/exports/sales"); len(rows) != 1 {
		t.Errorf("stranger sees sales: %v", rows)
	}
}

func TestUsersExportBusinessVerifiedColumn(t *testing.T) {
	w := newHiddenWorld(t)

	byEmail := func() map[string]string {
		got := map[string]string{}

		for _, row := range csvRows(t, w.admin.c, "/api/admin/exports/users")[1:] {
			got[row[0]] = row[len(row)-1]
		}

		return got
	}

	got := byEmail()
	if got[w.seller.email] != "Unverified" || got[w.buyer.email] != "Verified" || got[w.admin.email] != "" {
		t.Errorf("column: seller=%q buyer=%q admin=%q", got[w.seller.email], got[w.buyer.email], got[w.admin.email])
	}

	tradeWant(t, "business export", w.buyer.c.Do("GET", "/api/admin/exports/users", nil), 403)
}

func TestDashboardPartnersCarryTheVerifiedFlag(t *testing.T) {
	w := newHiddenWorld(t)
	tradeSale(t, w.seller, w.buyer, w.material, "2", "3")

	flag := func() any {
		dash := status(t, w.buyer.c.Do("GET", "/api/dashboard/business", nil), 200).Body
		for _, row := range dash["counterparties"].([]any) {
			if party := row.(map[string]any); party["id"] == w.seller.id {
				return party["business_verified"]
			}
		}

		t.Fatalf("seller missing from partners: %v", dash["counterparties"])

		return nil
	}

	if flag() != false {
		t.Error("unverified partner marked verified")
	}

	w.verify(t, true)

	if flag() != true {
		t.Error("verified partner not marked")
	}
}
