package tests

import (
	"strings"
	"testing"
)

func TestQAStockMutationRoles(t *testing.T) {
	w := newTradeWorld(t)
	for _, role := range []string{"collector", "staff", "admin", "guest"} {
		person := tradeNewUser(t, w.app, role)
		body := map[string]any{"material_id": w.material, "weight": "1.25", "price": "8"}
		status(t, person.c.Do("POST", "/api/stock", body), 403)
		status(t, person.c.Do("PATCH", "/api/stock/"+w.stock, map[string]any{"price": "9"}), 403)
		status(t, person.c.Do("DELETE", "/api/stock/"+w.stock, nil), 403)
	}

	other := tradeNewUser(t, w.app, "business")
	created := status(t, other.c.Do("POST", "/api/stock", map[string]any{
		"owner_id": w.seller.id, "material_id": w.material, "weight": "1.25", "price": "8",
	}), 200)
	owner := tradeText(t, w.app, `SELECT owner_id FROM stock WHERE id=$1`, created.Body["id"])
	if owner != other.id {
		t.Fatal("a business can create stock for someone else")
	}

	status(t, other.c.Do("PATCH", "/api/stock/"+w.stock, map[string]any{"price": "9"}), 404)
	status(t, other.c.Do("DELETE", "/api/stock/"+w.stock, nil), 404)
	status(t, w.seller.c.Do("PATCH", "/api/stock/"+w.stock, map[string]any{"price": "9"}), 200)
	status(t, w.seller.c.Do("DELETE", "/api/stock/"+w.stock, nil), 200)
}

func TestQACompletedRequestKeepsTransactionLink(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, id, w.material, "1.25", "8.12")
	status(t, w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	done := status(t, w.seller.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)

	for _, person := range []tradeUser{w.buyer, w.seller} {
		got := status(t, person.c.Do("GET", "/api/requests/"+id, nil), 200)
		if got.Body["transaction_id"] != done.Body["transaction_id"] {
			t.Fatalf("completed request lost transaction: %s", got.Raw)
		}
	}

	other := tradeNewUser(t, w.app, "business")
	status(t, other.c.Do("GET", "/api/requests/"+id, nil), 404)
}

func TestQACartStoresAreCallerOwned(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	path := "/api/cart?seller_id=" + w.seller.id
	status(t, w.buyer.c.Do("PUT", path, map[string]any{"items": []map[string]any{
		{"stock_id": w.stock, "material_id": w.material, "weight": "1.25"},
	}}), 200)

	got := status(t, w.buyer.c.Do("GET", "/api/cart/stores", nil), 200)
	rows := tradeItems(got)
	if len(rows) != 1 || rows[0].(map[string]any)["id"] != w.seller.id {
		t.Fatalf("saved carts: %s", got.Raw)
	}
	if rows[0].(map[string]any)["item_count"] != float64(1) {
		t.Fatalf("saved cart line count: %s", got.Raw)
	}
	if len(tradeItems(status(t, other.c.Do("GET", "/api/cart/stores?buyer_id="+w.buyer.id, nil), 200))) != 0 {
		t.Fatal("another buyer can see saved carts")
	}
	status(t, w.app.NewClient(t).Do("GET", "/api/cart/stores", nil), 401)
	status(t, w.buyer.c.Do("DELETE", path, nil), 200)
	if len(tradeItems(w.buyer.c.Do("GET", "/api/cart/stores", nil))) != 0 {
		t.Fatal("empty cart remains selectable")
	}
}

func TestQAReviewSummaryAndNotification(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	tx := tradeSale(t, w.seller, w.buyer, w.material, "5.25", "8.12")
	eligible := w.buyer.c.Do("GET", "/api/reviews/reviewable?seller_id="+w.seller.id, nil)
	summary := tradeItems(eligible)[0].(map[string]any)["summary"].(string)
	if !strings.Contains(summary, "5.25 kg") || strings.Contains(summary, tx) {
		t.Fatalf("review summary: %q", summary)
	}

	socks := joinLive(t, w.app, w.seller, w.buyer, other)
	review := status(t, w.buyer.c.Do("POST", "/api/transactions/"+tx+"/review", map[string]any{"rating": 4}), 200)
	id := tradeText(t, w.app, `SELECT id FROM notifications WHERE user_id=$1 AND title='New trade review'`, w.seller.id)
	if id == "" {
		t.Fatal("seller has no review notification")
	}
	socks[0].hear("notification", id)
	for _, sock := range socks[1:] {
		sock.hear("review", review.Body["id"].(string))
		sock.quiet("review notification belongs only to seller")
	}

	status(t, w.buyer.c.Do("POST", "/api/transactions/"+tx+"/review", map[string]any{"rating": 5}), 409)
	count := tradeText(t, w.app, `SELECT count(*)::text FROM notifications WHERE title='New trade review'`)
	if count != "1" {
		t.Fatalf("review notification count %s", count)
	}
	status(t, other.c.Do("GET", "/api/notifications/"+id, nil), 404)
}
