package tests

import (
	"context"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

// tradeWorld is a seller with listed stock and a buyer, both businesses.
type tradeWorld struct {
	app      *testutil.App
	seller   tradeUser
	buyer    tradeUser
	material string
	stock    string
}

func newTradeWorld(t *testing.T) tradeWorld {
	t.Helper()

	app := testutil.Server(t)
	w := tradeWorld{
		app:    app,
		seller: tradeNewUser(t, app, "business"),
		buyer:  tradeNewUser(t, app, "business"),
	}

	w.material = tradeMaterial(t, app, "Glass", "5")
	w.stock = tradeStock(t, app, w.seller.id, w.material, "100", "8")

	return w
}

func TestRequestOfferAcceptFlow(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)

	got := w.seller.c.Do("GET", "/api/requests/incoming", nil)
	if n := len(tradeItems(got)); n != 1 {
		t.Fatalf("incoming: %d rows, want 1: %s", n, got.Raw)
	}

	tradeOffer(t, w.seller, id, w.material, "40", "9")

	res := w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil)
	tradeWant(t, "accept", res, 200)
	tradeWant(t, "seller confirms", w.seller.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)

	txID, _ := res.Body["transaction_id"].(string)
	if txID == "" {
		t.Fatalf("accept gave no transaction id: %s", res.Raw)
	}

	if got := tradeStockWeight(t, w.app, w.seller.id, w.material); got != "60.000000" && got != "60" {
		t.Errorf("seller stock %s, want 60", got)
	}

	if got := tradeStockWeight(t, w.app, w.buyer.id, w.material); got != "40.000000" && got != "40" {
		t.Errorf("buyer stock %s, want 40", got)
	}

	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id = $1`, id); got != "accepted" {
		t.Errorf("status %s, want accepted", got)
	}

	if got := tradeText(t, w.app, `SELECT total_price::text FROM transactions WHERE id = $1`, txID); got != "360.00" && got != "360" {
		t.Errorf("total %s, want 360", got)
	}

	// The seller hears about the new request and about the accepted offer.
	kinds := tradeText(t, w.app, `
		SELECT string_agg(type, ',' ORDER BY type) FROM notifications WHERE user_id = $1`, w.seller.id)
	if kinds != "request_accepted,request_received" {
		t.Errorf("seller notifications %q", kinds)
	}

	// A second accept finds no offer.
	tradeWant(t, "second accept", w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 409)
}

func TestRequestTransitions(t *testing.T) {
	w := newTradeWorld(t)

	// Wrong side gets 403; the right side moves the request.
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeWant(t, "seller cancels", w.seller.c.Do("POST", "/api/requests/"+id+"/cancel", nil), 403)
	tradeWant(t, "buyer rejects", w.buyer.c.Do("POST", "/api/requests/"+id+"/reject", nil), 403)
	tradeWant(t, "decline with no offer", w.buyer.c.Do("POST", "/api/requests/"+id+"/decline", nil), 409)

	tradeOffer(t, w.seller, id, w.material, "10", "9")
	tradeWant(t, "seller declines", w.seller.c.Do("POST", "/api/requests/"+id+"/decline", nil), 403)
	tradeWant(t, "buyer withdraws", w.buyer.c.Do("POST", "/api/requests/"+id+"/withdraw", nil), 403)
	tradeWant(t, "buyer declines", w.buyer.c.Do("POST", "/api/requests/"+id+"/decline", nil), 200)

	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id = $1`, id); got != "pending" {
		t.Errorf("after decline: %s, want pending", got)
	}

	tradeOffer(t, w.seller, id, w.material, "10", "9")
	tradeWant(t, "seller withdraws", w.seller.c.Do("POST", "/api/requests/"+id+"/withdraw", nil), 200)
	tradeWant(t, "seller rejects", w.seller.c.Do("POST", "/api/requests/"+id+"/reject", nil), 200)
	tradeWant(t, "buyer cancels a closed request", w.buyer.c.Do("POST", "/api/requests/"+id+"/cancel", nil), 409)

	id = tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeWant(t, "buyer cancels", w.buyer.c.Do("POST", "/api/requests/"+id+"/cancel", nil), 200)

	// Nobody can ask for their own listing, or for stock that is not listed.
	self := w.seller.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.seller.id, "items": []map[string]any{{"stock_id": w.stock}},
	})
	tradeWant(t, "own listing", self, 400)

	tradeExec(t, w.app, `UPDATE stock SET is_listed = false WHERE id = $1`, w.stock)
	unlisted := w.buyer.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.seller.id, "items": []map[string]any{{"stock_id": w.stock}},
	})
	tradeWant(t, "unlisted stock", unlisted, 400)
}

// Hole 6: only the two sides (and staff) may read a request.
func TestRequestDetailLeak(t *testing.T) {
	w := newTradeWorld(t)
	outsider := tradeNewUser(t, w.app, "business")
	staff := tradeNewUser(t, w.app, "staff")
	anon := w.app.NewClient(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)

	path := "/api/requests/" + id

	tradeWant(t, "buyer reads", w.buyer.c.Do("GET", path, nil), 200)
	tradeWant(t, "seller reads", w.seller.c.Do("GET", path, nil), 200)
	tradeWant(t, "staff reads", staff.c.Do("GET", path, nil), 200)
	tradeWant(t, "outsider reads", outsider.c.Do("GET", path, nil), 404)
	tradeWant(t, "anonymous reads", anon.Do("GET", path, nil), 401)
	tradeWant(t, "missing id", outsider.c.Do("GET", "/api/requests/nope", nil), 404)

	// Every action on someone else's request looks like a missing request.
	for _, action := range []string{"accept", "decline", "withdraw", "reject", "cancel"} {
		tradeWant(t, "outsider "+action, outsider.c.Do("POST", path+"/"+action, nil), 404)
		tradeWant(t, "anonymous "+action, anon.Do("POST", path+"/"+action, nil), 401)
	}

	offer := map[string]any{"items": []map[string]any{tradeLine(w.material, "1", "9")}}
	tradeWant(t, "outsider offer", outsider.c.Do("POST", path+"/offer", offer), 404)
	tradeWant(t, "anonymous offer", anon.Do("POST", path+"/offer", offer), 401)
	tradeWant(t, "buyer offer", w.buyer.c.Do("POST", path+"/offer", offer), 200)

	// Lists only hold the caller's own requests.
	for _, list := range []string{"/api/requests/incoming", "/api/requests/outgoing"} {
		if n := len(tradeItems(outsider.c.Do("GET", list, nil))); n != 0 {
			t.Errorf("outsider %s holds %d rows", list, n)
		}

		tradeWant(t, "anonymous "+list, anon.Do("GET", list, nil), 401)
	}

	tradeWant(t, "anonymous create", anon.Do("POST", "/api/requests", map[string]any{}), 401)

	// No email or phone in what the sides see of each other.
	raw := string(w.buyer.c.Do("GET", path, nil).Raw)
	for _, secret := range []string{w.seller.email, w.seller.phone} {
		if secret != "" && strings.Contains(raw, secret) {
			t.Errorf("request detail leaks %q", secret)
		}
	}
}

// Hole 14: an offer must have lines, for materials that were asked for.
func TestMakeOfferEmptyAndForeignMaterial(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeMaterial(t, w.app, "Tin", "5")
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	path := "/api/requests/" + id + "/offer"

	bad := map[string][]map[string]any{
		"empty":            {},
		"foreign material": {tradeLine(other, "1", "9")},
		"zero weight":      {tradeLine(w.material, "0", "9")},
		"negative weight":  {tradeLine(w.material, "-1", "9")},
		"duplicate":        {tradeLine(w.material, "1", "9"), tradeLine(w.material, "1", "9")},
	}

	for name, items := range bad {
		tradeWant(t, name, w.seller.c.Do("POST", path, map[string]any{"items": items}), 400)
	}

	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id = $1`, id); got != "pending" {
		t.Errorf("status %s after bad offers, want pending", got)
	}
}

// Hole 21: accepting checks the stock again, and old single-item requests work.
func TestAcceptOfferChecksStockAndLegacyRequest(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)

	tradeOffer(t, w.seller, id, w.material, "80", "9")

	// The seller sells most of it elsewhere before the buyer accepts.
	tradeExec(t, w.app, `UPDATE stock SET weight = 10 WHERE id = $1`, w.stock)

	tradeWant(t, "first confirmation", w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	res := w.seller.c.Do("POST", "/api/requests/"+id+"/accept", nil)
	if res.Status < 400 || res.Status >= 500 {
		t.Fatalf("accept without stock: %d, want a 4xx: %s", res.Status, res.Raw)
	}

	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id = $1`, id); got != "offered" {
		t.Errorf("status %s after a failed accept, want offered", got)
	}

	if n := tradeText(t, w.app, `SELECT count(*)::text FROM transactions`); n != "1" {
		t.Errorf("%s transactions after a failed settlement, want 1 pending", n)
	}

	// An old single-item request has no stock id on its item.
	tradeExec(t, w.app, `UPDATE stock SET weight = 100 WHERE id = $1`, w.stock)

	legacy := database.NewID()

	_, err := w.app.DB.Pool.Exec(context.Background(), `
		INSERT INTO transaction_requests (id, seller_id, buyer_id, status)
		VALUES ($1, $2, $3, 'offered')`, legacy, w.seller.id, w.buyer.id)
	if err != nil {
		t.Fatal(err)
	}

	tradeExec(t, w.app, `
		INSERT INTO transaction_request_items
			(request_id, position, material_id, stock_id, offer_weight, offer_price)
		VALUES ($1, 0, $2, NULL, 5, 9)`, legacy, w.material)

	tradeWant(t, "legacy detail", w.buyer.c.Do("GET", "/api/requests/"+legacy, nil), 200)
	tradeWant(t, "legacy accept without hold", w.buyer.c.Do("POST", "/api/requests/"+legacy+"/accept", nil), 409)
	tradeOffer(t, w.seller, legacy, w.material, "5", "9")
	tradeWant(t, "legacy renewed accept", w.buyer.c.Do("POST", "/api/requests/"+legacy+"/accept", nil), 200)
	tradeWant(t, "legacy seller confirms", w.seller.c.Do("POST", "/api/requests/"+legacy+"/accept", nil), 200)

	if got := tradeStockWeight(t, w.app, w.seller.id, w.material); got != "95.000000" && got != "95" {
		t.Errorf("seller stock %s after the legacy accept, want 95", got)
	}
}
