package tests

import (
	"context"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/3reco/internal/services/notifications"
	"github.com/connor-davis/3reco/internal/services/requests"
	notesstore "github.com/connor-davis/3reco/internal/stores/notifications"
	requestsstore "github.com/connor-davis/3reco/internal/stores/requests"
	"github.com/connor-davis/3reco/tests/testutil"
)

func holdDecimal(t *testing.T, got any, want string) {
	t.Helper()

	text, ok := got.(string)
	if !ok {
		t.Fatalf("decimal is not a string: %#v", got)
	}

	actual, valid := new(big.Rat).SetString(text)
	expected, _ := new(big.Rat).SetString(want)
	if !valid || actual.Cmp(expected) != 0 {
		t.Fatalf("decimal %q, want %q", text, want)
	}
}

func holdCount(t *testing.T, w tradeWorld, status, want string) {
	t.Helper()

	got := tradeText(t, w.app, `SELECT count(*)::text FROM stock_holds WHERE status=$1`, status)
	if got != want {
		t.Fatalf("%s holds: %s, want %s", status, got, want)
	}
}

func TestStockHoldsAvailabilityAndAccept(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	cartPath := "/api/cart?seller_id=" + w.seller.id
	status(t, w.buyer.c.Do("PUT", cartPath, map[string]any{
		"items": []map[string]any{{"stock_id": w.stock, "material_id": w.material, "weight": "2.5"}},
	}), 200)

	tradeOffer(t, w.seller, id, w.material, "40.125", "9")
	holdCount(t, w, "active", "1")
	holdDecimal(t, tradeStockWeight(t, w.app, w.seller.id, w.material), "100")
	ttl := tradeText(t, w.app, `SELECT (expires_at-created_at BETWEEN
		interval '47 hours 59 minutes' AND interval '48 hours 1 minute')::text
		FROM stock_holds WHERE request_id=$1`, id)
	if ttl != "true" {
		t.Fatalf("hold lifetime: %s", ttl)
	}

	listing := status(t, w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200)
	holdDecimal(t, listing.Body["weight"], "59.875")
	cart := status(t, w.buyer.c.Do("GET", cartPath, nil), 200)
	holdDecimal(t, tradeItems(cart)[0].(map[string]any)["weight"], "2.5")

	stock := status(t, w.seller.c.Do("GET", "/api/stock/"+w.stock, nil), 200)
	holdDecimal(t, stock.Body["weight"], "100")
	holdDecimal(t, stock.Body["available_weight"], "59.875")

	list := pageItems(t, status(t, w.seller.c.Do("GET", "/api/stock", nil), 200))
	holdDecimal(t, list[0]["available_weight"], "59.875")
	request := status(t, w.buyer.c.Do("GET", "/api/requests/"+id, nil), 200)
	holdDecimal(t, tradeItems(request)[0].(map[string]any)["available_weight"], "100")

	// A separate buyer's hold must survive this acceptance.
	other := tradeNewUser(t, w.app, "business")
	otherID := tradeRequest(t, other, w.seller, w.stock)
	tradeOffer(t, w.seller, otherID, w.material, "59.875", "9")
	reserved := status(t, w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200)
	holdDecimal(t, reserved.Body["weight"], "0")
	holdDecimal(t, reserved.Body["held_weight"], "100")
	if items := pageItems(t, w.buyer.c.Do("GET", "/api/market/listings", nil)); len(items) != 1 {
		t.Fatalf("fully held listing missing: %+v", items)
	}

	if items := tradeItems(w.buyer.c.Do("GET", cartPath, nil)); len(items) != 0 {
		t.Fatalf("fully held cart visible: %+v", items)
	}

	status(t, w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	status(t, w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 409)
	status(t, w.seller.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	holdCount(t, w, "consumed", "1")
	holdCount(t, w, "active", "1")
	holdDecimal(t, tradeStockWeight(t, w.app, w.seller.id, w.material), "59.875")
	holdDecimal(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "40.125")
}

func TestStockHoldsRacingOffers(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	ids := []string{
		tradeRequest(t, w.buyer, w.seller, w.stock),
		tradeRequest(t, other, w.seller, w.stock),
	}

	start := make(chan struct{})
	results := make(chan testutil.Response, 2)
	for _, id := range ids {
		go func() {
			<-start
			results <- w.seller.c.Do("POST", "/api/requests/"+id+"/offer", map[string]any{
				"items": []map[string]any{tradeLine(w.material, "99", "9")},
			})
		}()
	}

	close(start)
	success, conflict := 0, 0
	for range ids {
		result := <-results
		switch result.Status {
		case 200:
			success++
		case 409:
			conflict++
		default:
			t.Fatalf("racing offer: %d %s", result.Status, result.Raw)
		}
	}

	if success != 1 || conflict != 1 {
		t.Fatalf("success=%d conflict=%d", success, conflict)
	}

	holdCount(t, w, "active", "2")
}

func TestStockHoldsMultiItemRollback(t *testing.T) {
	w := newTradeWorld(t)
	material := tradeMaterial(t, w.app, "Metal", "5")
	stock := tradeStock(t, w.app, w.seller.id, material, "10", "8")
	result := status(t, w.buyer.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.seller.id,
		"items":     []map[string]any{{"stock_id": w.stock, "weight": "1"}, {"stock_id": stock, "weight": "1"}},
	}), 200)
	id := result.Body["id"].(string)
	path := "/api/requests/" + id + "/offer"
	badLines := []map[string]any{
		tradeLine(w.material, "60", "9"), tradeLine(material, "11", "9"),
	}
	if strings.Compare(w.material, material) > 0 {
		badLines = []map[string]any{
			tradeLine(w.material, "101", "9"), tradeLine(material, "10", "9"),
		}
	}

	// The invalid line sorts last, after the first line acquired its hold.
	status(t, w.seller.c.Do("POST", path, map[string]any{"items": badLines}), 409)
	holdCount(t, w, "active", "2")
	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id=$1`, id); got != "pending" {
		t.Fatalf("failed offer status: %s", got)
	}

	status(t, w.seller.c.Do("POST", path, map[string]any{"items": []map[string]any{
		tradeLine(material, "10", "9"), tradeLine(w.material, "60", "9"),
	}}), 200)
	holdCount(t, w, "active", "2")

	// A failed counter preserves the whole previous offer and both reservations.
	status(t, w.buyer.c.Do("POST", path, map[string]any{"items": badLines}), 409)
	holdCount(t, w, "active", "2")
	holdCount(t, w, "released", "2")
	holdDecimal(t, tradeText(t, w.app, `SELECT sum(weight)::text FROM stock_holds
		WHERE request_id=$1 AND status='active'`, id), "70")
}

func TestStockHoldsReleaseAndReplace(t *testing.T) {
	for _, action := range []string{"reject", "cancel", "decline", "withdraw", "delete"} {
		t.Run(action, func(t *testing.T) {
			w := newTradeWorld(t)
			id := tradeRequest(t, w.buyer, w.seller, w.stock)
			tradeOffer(t, w.seller, id, w.material, "90", "9")
			tradeOffer(t, w.buyer, id, w.material, "20", "9")
			tradeOffer(t, w.seller, id, w.material, "20", "9")
			holdCount(t, w, "active", "1")
			holdCount(t, w, "released", "3")
			holdDecimal(t, status(t, w.seller.c.Do("GET", "/api/stock/"+w.stock, nil), 200).
				Body["available_weight"], "80")

			if action == "delete" {
				// There is no request-delete route; its FK cascade also frees stock.
				tradeExec(t, w.app, `DELETE FROM transaction_requests WHERE id=$1`, id)
			} else {
				actor := w.seller
				if action == "cancel" || action == "decline" {
					actor = w.buyer
				}

				status(t, actor.c.Do("POST", "/api/requests/"+id+"/"+action, nil), 200)
				if got := tradeText(t, w.app, `SELECT count(*)::text FROM transaction_request_items
					WHERE request_id=$1 AND (offer_weight IS NOT NULL OR offer_price IS NOT NULL)`, id); got != "0" {
					t.Fatalf("stale offer fields: %s", got)
				}
			}

			holdCount(t, w, "active", "0")
			holdDecimal(t, status(t, w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200).
				Body["weight"], "100")
		})
	}
}

func TestStockHoldsExpiry(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, id, w.material, "100", "9")
	tradeExec(t, w.app, `UPDATE stock_holds SET expires_at=clock_timestamp()-interval '1 second'
		WHERE request_id=$1`, id)

	result := status(t, w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 409)
	if result.Body["message"] != "This offer ran out. Ask the seller for a new offer." {
		t.Fatalf("expired error: %s", result.Raw)
	}

	holdDecimal(t, status(t, w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200).
		Body["weight"], "100")
	notes := notifications.New(notesstore.New(w.app.DB))
	service := requests.New(w.app.DB, requestsstore.New(w.app.DB), w.app.Trades, notes)
	for range 2 {
		if err := service.ExpireOffers(context.Background()); err != nil {
			t.Fatal(err)
		}
	}

	holdCount(t, w, "released", "2")
	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id=$1`, id); got != "pending" {
		t.Fatalf("expiry status: %s", got)
	}

	if got := tradeText(t, w.app, `SELECT count(*)::text FROM transaction_request_items
		WHERE request_id=$1 AND (offer_weight IS NOT NULL OR offer_price IS NOT NULL)`, id); got != "0" {
		t.Fatalf("expiry retained offer: %s", got)
	}

	if got := tradeText(t, w.app, `SELECT count(DISTINCT user_id)::text FROM notifications
		WHERE title='Offer ran out' AND link=$1`, "/market/"+id); got != "2" {
		t.Fatalf("expiry parties notified: %s", got)
	}

	if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications
		WHERE title='Offer ran out'`); got != "2" {
		t.Fatalf("duplicate expiry notifications: %s", got)
	}

	status(t, w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 409)
	tradeOffer(t, w.seller, id, w.material, "100", "9")
	status(t, w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
}

func TestStockHoldsProtectEditsAndDirectSales(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, id, w.material, "80", "9")
	path := "/api/stock/" + w.stock

	result := status(t, w.seller.c.Do("POST", "/api/transactions/sales", map[string]any{
		"business_id": w.buyer.id, "items": []map[string]any{tradeLine(w.material, "21", "9")},
	}), 400)
	if result.Body["message"] == "" {
		t.Fatal("missing stock error")
	}

	for _, result := range []testutil.Response{
		w.seller.c.Do("PATCH", path, map[string]any{"weight": "79"}),
		w.seller.c.Do("PATCH", path, map[string]any{"weight": "0"}),
		w.seller.c.Do("DELETE", path, nil),
	} {
		status(t, result, 409)
		if result.Body["message"] != "Some of this stock is held for open offers." {
			t.Fatalf("stock conflict: %s", result.Raw)
		}
	}

	tradeSale(t, w.seller, w.buyer, w.material, "20", "9")
	status(t, w.seller.c.Do("PATCH", path, map[string]any{"weight": "80"}), 200)
	status(t, w.seller.c.Do("PATCH", path, map[string]any{"price": "10"}), 200)
	status(t, w.seller.c.Do("PATCH", path, map[string]any{"is_listed": false}), 200)
	holdCount(t, w, "active", "1")

	outsider := tradeNewUser(t, w.app, "business")
	status(t, outsider.c.Do("GET", path, nil), 404)
	status(t, outsider.c.Do("PATCH", path, map[string]any{"weight": "1"}), 404)
	status(t, outsider.c.Do("DELETE", path, nil), 404)
	status(t, outsider.c.Do("GET", "/api/requests/"+id, nil), 404)
	if items := pageItems(t, outsider.c.Do("GET", "/api/stock", nil)); len(items) != 0 {
		t.Fatalf("foreign inventory: %+v", items)
	}

	for _, action := range []string{"accept", "reject", "cancel", "withdraw", "decline", "offer"} {
		status(t, outsider.c.Do("POST", "/api/requests/"+id+"/"+action, map[string]any{
			"items": []map[string]any{tradeLine(w.material, "1", "9")},
		}), 404)
	}

	holdCount(t, w, "active", "1")
	status(t, w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	status(t, w.seller.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	holdCount(t, w, "consumed", "1")
	holdDecimal(t, tradeStockWeight(t, w.app, w.seller.id, w.material), "0")
}

func TestStockHoldsAcceptRollback(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, id, w.material, "40", "9")
	tradeExec(t, w.app, `ALTER TABLE notifications ADD CONSTRAINT fail_accept_note
		CHECK (title<>'Offer accepted!')`)

	status(t, w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	status(t, w.seller.c.Do("POST", "/api/requests/"+id+"/accept", nil), 500)
	holdCount(t, w, "active", "1")
	holdCount(t, w, "consumed", "0")
	holdDecimal(t, tradeStockWeight(t, w.app, w.seller.id, w.material), "100")
	if got := tradeText(t, w.app, `SELECT count(*)::text FROM transactions`); got != "1" {
		t.Fatalf("failed settlement should retain one pending transaction: %s", got)
	}

	tradeExec(t, w.app, `ALTER TABLE notifications DROP CONSTRAINT fail_accept_note`)
	status(t, w.seller.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	holdCount(t, w, "consumed", "1")
}

func TestStockHoldsExpirySkipsLocksAndRollsBack(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, id, w.material, "40", "9")
	tradeExec(t, w.app, `UPDATE stock_holds SET expires_at=clock_timestamp()-interval '1 second'
		WHERE request_id=$1`, id)
	notes := notifications.New(notesstore.New(w.app.DB))
	service := requests.New(w.app.DB, requestsstore.New(w.app.DB), w.app.Trades, notes)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	locked, err := w.app.DB.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer locked.Rollback(context.Background())

	if _, err := locked.Exec(ctx, `SELECT id FROM transaction_requests WHERE id=$1 FOR UPDATE`, id); err != nil {
		t.Fatal(err)
	}

	if err := service.ExpireOffers(ctx); err != nil {
		t.Fatalf("expiry blocked on locked request: %v", err)
	}

	holdCount(t, w, "active", "1")
	if err := locked.Rollback(ctx); err != nil {
		t.Fatal(err)
	}

	tradeExec(t, w.app, `ALTER TABLE notifications ADD CONSTRAINT fail_expiry_note
		CHECK (title<>'Offer ran out')`)
	if err := service.ExpireOffers(ctx); err == nil {
		t.Fatal("expiry succeeded despite notification failure")
	}

	holdCount(t, w, "active", "1")
	holdCount(t, w, "released", "1")
	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id=$1`, id); got != "offered" {
		t.Fatalf("failed expiry changed status: %s", got)
	}

	holdDecimal(t, tradeText(t, w.app, `SELECT offer_weight::text FROM transaction_request_items
		WHERE request_id=$1`, id), "40")
	tradeExec(t, w.app, `ALTER TABLE notifications DROP CONSTRAINT fail_expiry_note`)
	if err := service.ExpireOffers(ctx); err != nil {
		t.Fatal(err)
	}

	holdCount(t, w, "released", "2")
}

func TestStockHoldsRealtime(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	sock := joinLive(t, w.app, w.seller)[0]

	tradeOffer(t, w.seller, id, w.material, "40", "9")

	sock.hear("request", id)
	sock.hear("stock", w.stock)
}
