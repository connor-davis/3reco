package tests

import (
	"context"
	"strings"
	"testing"

	reviewstore "github.com/connor-davis/3reco/internal/stores/reviews"
)

func TestReviewFlow(t *testing.T) {
	w := newTradeWorld(t)
	tx := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")

	rev := w.buyer.c.Do("GET", "/api/reviews/reviewable?seller_id="+w.seller.id, nil)
	if n := len(tradeItems(rev)); n != 1 {
		t.Fatalf("reviewable: %d, want 1: %s", n, rev.Raw)
	}

	path := "/api/transactions/" + tx + "/review"

	tradeWant(t, "rating 0", w.buyer.c.Do("POST", path, map[string]any{"rating": 0}), 400)
	tradeWant(t, "rating 6", w.buyer.c.Do("POST", path, map[string]any{"rating": 6}), 400)
	tradeWant(t, "long comment", w.buyer.c.Do("POST", path,
		map[string]any{"rating": 5, "comment": strings.Repeat("x", 1001)}), 400)
	tradeWant(t, "review", w.buyer.c.Do("POST", path, map[string]any{"rating": 4, "comment": "Good"}), 200)
	tradeWant(t, "twice", w.buyer.c.Do("POST", path, map[string]any{"rating": 5}), 409)

	rev = w.buyer.c.Do("GET", "/api/reviews/reviewable?seller_id="+w.seller.id, nil)
	if n := len(tradeItems(rev)); n != 0 {
		t.Errorf("reviewable after review: %d, want 0", n)
	}

	tradeWant(t, "reviewable without seller", w.buyer.c.Do("GET", "/api/reviews/reviewable", nil), 400)
}

func TestReviewAccess(t *testing.T) {
	w := newTradeWorld(t)
	outsider := tradeNewUser(t, w.app, "business")
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	anon := w.app.NewClient(t)
	tx := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")
	path := "/api/transactions/" + tx + "/review"
	body := map[string]any{"rating": 3}

	tradeWant(t, "seller reviews own sale", w.seller.c.Do("POST", path, body), 404)
	tradeWant(t, "outsider reviews", outsider.c.Do("POST", path, body), 404)
	tradeWant(t, "admin reviews", admin.c.Do("POST", path, body), 403)
	tradeWant(t, "anonymous reviews", anon.Do("POST", path, body), 401)
	tradeWant(t, "missing transaction", w.buyer.c.Do("POST", "/api/transactions/nope/review", body), 404)

	// Reviewable only ever lists the caller's own purchases.
	rev := outsider.c.Do("GET", "/api/reviews/reviewable?seller_id="+w.seller.id, nil)
	if n := len(tradeItems(rev)); n != 0 {
		t.Errorf("outsider sees %d reviewable trades, want 0", n)
	}

	tradeWant(t, "anonymous reviewable", anon.Do("GET", "/api/reviews/reviewable?seller_id=x", nil), 401)

	// A collector sale cannot be reviewed.
	collector := tradeCollector(t, w.app, w.buyer, "+27800000009")
	coll := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "1", "6")))
	tradeWant(t, "c2b review", w.buyer.c.Do("POST", "/api/transactions/"+
		coll.Body["transaction_id"].(string)+"/review", body), 400)

	// Only an admin removes a review.
	tradeWant(t, "buyer reviews", w.buyer.c.Do("POST", path, body), 200)

	id := tradeText(t, w.app, `SELECT id FROM store_reviews LIMIT 1`)
	url := "/api/admin/reviews/" + id

	tradeWant(t, "buyer removes", w.buyer.c.Do("DELETE", url, nil), 403)
	tradeWant(t, "seller removes", w.seller.c.Do("DELETE", url, nil), 403)
	tradeWant(t, "staff removes", staff.c.Do("DELETE", url, nil), 403)
	tradeWant(t, "anonymous removes", anon.Do("DELETE", url, nil), 401)
	tradeWant(t, "admin removes", admin.c.Do("DELETE", url, nil), 200)
	tradeWant(t, "admin removes again", admin.c.Do("DELETE", url, nil), 404)
}

// Hole 8: the public review list shows a rating, a comment and a safe name,
// and nothing that identifies the buyer's account.
func TestReviewsPublicProjection(t *testing.T) {
	w := newTradeWorld(t)
	anon := w.app.NewClient(t)
	tx := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")

	tradeWant(t, "review", w.buyer.c.Do("POST", "/api/transactions/"+tx+"/review",
		map[string]any{"rating": 4, "comment": "Good"}), 200)

	tx2 := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")
	tradeWant(t, "second review", w.buyer.c.Do("POST", "/api/transactions/"+tx2+"/review",
		map[string]any{"rating": 5}), 200)

	list := anon.Do("GET", "/api/stores/"+w.seller.id+"/reviews", nil)
	tradeWant(t, "public list", list, 200)

	items := tradeItems(list)
	if len(items) != 2 {
		t.Fatalf("public list: %d reviews, want 2: %s", len(items), list.Raw)
	}

	row, _ := items[0].(map[string]any)

	want := map[string]bool{
		"id": true, "rating": true, "comment": true, "reviewer_name": true,
		"created_at": true, "materials": true,
	}
	for key := range want {
		if _, ok := row[key]; !ok {
			t.Errorf("public review is missing the field %q", key)
		}
	}
	for key := range row {
		if !want[key] {
			t.Errorf("public review has the extra field %q", key)
		}
	}

	for _, secret := range []string{w.buyer.id, w.buyer.email, w.buyer.phone, tx, tx2} {
		if strings.Contains(string(list.Raw), secret) {
			t.Errorf("public list leaks %q", secret)
		}
	}

	if row["reviewer_name"] != "Biz "+w.buyer.id[:6] {
		t.Errorf("reviewer name %v, want the business name", row["reviewer_name"])
	}

	sum := anon.Do("GET", "/api/stores/"+w.seller.id+"/reviews/summary", nil)
	if sum.Body["average"] != 4.5 || sum.Body["count"] != float64(2) {
		t.Errorf("summary %s, want average 4.5 over 2", sum.Raw)
	}

	empty := anon.Do("GET", "/api/stores/nobody/reviews/summary", nil)
	if empty.Body["average"] != nil || empty.Body["count"] != float64(0) {
		t.Errorf("empty summary %s, want a null average and 0", empty.Raw)
	}
}

// reviewSale makes one finished sale and the buyer's review of it.
func reviewSale(t *testing.T, w tradeWorld, seller tradeUser, stars int) {
	t.Helper()

	tx := tradeSale(t, seller, w.buyer, w.material, "1", "8")

	tradeWant(t, "review", w.buyer.c.Do("POST", "/api/transactions/"+tx+"/review",
		map[string]any{"rating": stars}), 200)
}

// The batched summary must give every seller the same answer the one-seller
// query gives, including a seller nobody has reviewed.
func TestSummaryManyMatchesSingle(t *testing.T) {
	w := newTradeWorld(t)
	unreviewed := tradeNewUser(t, w.app, "business")
	single := tradeNewUser(t, w.app, "business")

	tradeStock(t, w.app, single.id, w.material, "100", "8")

	// 5, 4 and 4 average 4.33, so this also checks the one-decimal rounding.
	for _, stars := range []int{5, 4, 4} {
		reviewSale(t, w, w.seller, stars)
	}

	reviewSale(t, w, single, 3)

	ctx := context.Background()
	store := reviewstore.New(w.app.DB)
	ids := []string{w.seller.id, unreviewed.id, single.id, "nobody"}

	many, err := store.AverageMany(ctx, ids)
	if err != nil {
		t.Fatal(err)
	}

	for _, id := range ids {
		want, err := store.Average(ctx, id)
		if err != nil {
			t.Fatal(err)
		}

		got := many[id]
		if got.Count != want.Count {
			t.Errorf("seller %s: count %d, want %d", id, got.Count, want.Count)
		}

		if (got.Average == nil) != (want.Average == nil) ||
			(got.Average != nil && *got.Average != *want.Average) {
			t.Errorf("seller %s: average %v, want %v", id, got.Average, want.Average)
		}
	}

	if got := many[w.seller.id]; got.Average == nil || *got.Average != 4.3 || got.Count != 3 {
		t.Errorf("three reviews: %+v, want average 4.3 over 3", got)
	}

	if got := many[single.id]; got.Average == nil || *got.Average != 3 || got.Count != 1 {
		t.Errorf("one review: %+v, want average 3 over 1", got)
	}

	if _, ok := many[unreviewed.id]; ok {
		t.Errorf("a seller with no reviews should be left out of the map")
	}

	empty, err := store.AverageMany(ctx, nil)
	if err != nil || len(empty) != 0 {
		t.Errorf("no sellers: got %v, %v, want an empty map", empty, err)
	}
}
