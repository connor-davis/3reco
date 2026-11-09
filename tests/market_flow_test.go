package tests

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/services/notifications"
	"github.com/connor-davis/3reco/internal/services/requests"
	notesstore "github.com/connor-davis/3reco/internal/stores/notifications"
	requestsstore "github.com/connor-davis/3reco/internal/stores/requests"
	"github.com/connor-davis/3reco/tests/testutil"
)

func marketRequest(t *testing.T, w tradeWorld, weight string) string {
	t.Helper()

	res := status(t, w.buyer.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.seller.id,
		"items":     []map[string]any{{"stock_id": w.stock, "weight": weight, "price": "0.01"}},
	}), 200)

	return res.Body["id"].(string)
}

func marketExpire(t *testing.T, w tradeWorld, id string) {
	t.Helper()

	tradeExec(t, w.app, `UPDATE stock_holds SET expires_at=clock_timestamp()-interval '1 second'
		WHERE request_id=$1 AND status='active'`, id)
	notes := notifications.New(notesstore.New(w.app.DB))
	service := requests.New(w.app.DB, requestsstore.New(w.app.DB), w.app.Trades, notes)
	if err := service.ExpireOffers(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestMarketRequestTermsAndHolds(t *testing.T) {
	w := newTradeWorld(t)
	id := marketRequest(t, w, "12.12")
	path := "/api/requests/" + id
	request := status(t, w.seller.c.Do("GET", path, nil), 200)
	line := tradeItems(request)[0].(map[string]any)
	holdDecimal(t, line["requested_weight"], "12.12")
	holdDecimal(t, line["requested_price"], "8")
	holdCount(t, w, "active", "1")

	body := tradeText(t, w.app, `SELECT body FROM notifications WHERE user_id=$1 AND type='request_received'`, w.seller.id)
	for _, term := range []string{"Glass", "12.12", "R 8.00 / kg"} {
		if !strings.Contains(body, term) {
			t.Errorf("notification %q lacks %q", body, term)
		}
	}

	tradeExec(t, w.app, `UPDATE stock SET price=10 WHERE id=$1`, w.stock)
	holdDecimal(t, tradeText(t, w.app, `SELECT requested_price::text FROM transaction_request_items WHERE request_id=$1`, id), "8")
	for _, weight := range []string{"0", "-1", "88", "NaN", ""} {
		res := w.buyer.c.Do("POST", "/api/requests", map[string]any{
			"seller_id": w.seller.id, "items": []map[string]any{{"stock_id": w.stock, "weight": weight}},
		})
		if res.Status < 400 || res.Status >= 500 {
			t.Fatalf("invalid weight %q: %d %s", weight, res.Status, res.Raw)
		}
	}

	marketExpire(t, w, id)
	holdCount(t, w, "active", "0")
	holdDecimal(t, status(t, w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200).
		Body["weight"], "100")
	status(t, w.buyer.c.Do("POST", path+"/messages", map[string]any{"content": "Still negotiating"}), 200)
	tradeOffer(t, w.buyer, id, w.material, "10", "9")
	holdCount(t, w, "active", "1")
}

func TestMarketDualConfirmationAndReaders(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")
	admin := tradeNewUser(t, w.app, "admin")
	id := marketRequest(t, w, "12.12")
	path := "/api/requests/" + id
	tradeOffer(t, w.seller, id, w.material, "10.25", "9.5")
	status(t, w.seller.c.Do("POST", path+"/accept", nil), 403)
	status(t, stranger.c.Do("POST", path+"/accept", nil), 404)

	res := status(t, w.buyer.c.Do("POST", path+"/accept", nil), 200)
	tx := res.Body["transaction_id"].(string)
	holdDecimal(t, tradeStockWeight(t, w.app, w.seller.id, w.material), "100")
	holdDecimal(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "0")
	holdCount(t, w, "active", "1")
	if got := tradeText(t, w.app, `SELECT status FROM transactions WHERE id=$1`, tx); got != "pending" {
		t.Fatal(got)
	}

	for _, party := range []tradeUser{w.buyer, w.seller, admin} {
		rows := tradeItems(status(t, party.c.Do("GET", "/api/transactions?status=pending", nil), 200))
		if len(rows) != 1 || rows[0].(map[string]any)["request_id"] != id {
			t.Fatalf("pending rows: %v", rows)
		}
		if len(tradeItems(party.c.Do("GET", "/api/transactions", nil))) != 0 {
			t.Fatal("pending trade appeared in complete list")
		}
	}
	if len(tradeItems(stranger.c.Do("GET", "/api/transactions?status=pending", nil))) != 0 {
		t.Fatal("stranger sees pending trade")
	}
	status(t, stranger.c.Do("GET", "/api/transactions/"+tx, nil), 404)
	status(t, stranger.c.Do("GET", "/api/transactions/"+tx+"/invoice", nil), 404)
	status(t, w.buyer.c.Do("GET", "/api/transactions/"+tx+"/invoice", nil), 404)
	status(t, w.buyer.c.Do("POST", "/api/transactions/"+tx+"/review", map[string]any{"rating": 5}), 404)
	if len(tradeItems(w.buyer.c.Do("GET", "/api/reviews/reviewable?seller_id="+w.seller.id, nil))) != 0 {
		t.Fatal("pending trade reviewable")
	}

	for _, party := range []tradeUser{w.buyer, admin} {
		totals := status(t, party.c.Do("GET", "/api/transactions/totals", nil), 200)
		if totals.Body["count"] != float64(0) {
			t.Fatal("pending trade counted in totals")
		}
	}
	for _, target := range []struct {
		party tradeUser
		path  string
	}{{w.buyer, "/api/dashboard/business"}, {admin, "/api/admin/dashboard"}} {
		dashboard := status(t, target.party.c.Do("GET", target.path, nil), 200)
		if dashboard.Body["totals"].(map[string]any)["count"] != float64(0) {
			t.Fatal("pending trade counted on dashboard")
		}
	}
	stats := status(t, w.buyer.c.Do("GET", "/api/stats", nil), 200)
	if stats.Body["deals"] != float64(0) {
		t.Fatal("pending trade counted as impact")
	}
	for _, row := range csvRows(t, w.buyer.c, "/api/exports/purchases")[1:] {
		if row[0] == tx {
			t.Fatal("pending trade exported")
		}
	}
	if got := tradeText(t, w.app, `SELECT COALESCE(invoice_key,'') FROM transactions WHERE id=$1`, tx); got != "" {
		t.Fatal("pending trade has invoice")
	}

	status(t, tradeSay(t, w.buyer, id, "Please confirm"), 200)
	status(t, w.buyer.c.Do("POST", path+"/accept", nil), 409)
	res = status(t, w.seller.c.Do("POST", path+"/accept", nil), 200)
	if res.Body["transaction_id"] != tx {
		t.Fatal("second confirmation replaced the pending row")
	}
	holdDecimal(t, tradeStockWeight(t, w.app, w.seller.id, w.material), "89.75")
	holdDecimal(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "10.25")
	if got := tradeText(t, w.app, `SELECT status FROM transactions WHERE id=$1`, tx); got != "complete" {
		t.Fatal(got)
	}
	status(t, tradeSay(t, w.buyer, id, "Closed"), 409)
	status(t, w.buyer.c.Do("GET", "/api/transactions/"+tx+"/invoice", nil), 200)
}

func TestMarketCounterAndCancellation(t *testing.T) {
	for _, action := range []string{"counter", "withdraw", "reject", "cancel", "expiry"} {
		t.Run(action, func(t *testing.T) {
			w := newTradeWorld(t)
			stranger := tradeNewUser(t, w.app, "business")
			id := marketRequest(t, w, "10")
			path := "/api/requests/" + id
			tradeOffer(t, w.buyer, id, w.material, "8", "9")
			status(t, w.buyer.c.Do("POST", path+"/accept", nil), 403)
			status(t, w.buyer.c.Do("POST", path+"/decline", nil), 403)
			first := status(t, w.seller.c.Do("POST", path+"/accept", nil), 200)
			tx := first.Body["transaction_id"].(string)
			if action != "counter" && action != "expiry" {
				status(t, stranger.c.Do("POST", path+"/"+action, nil), 404)
			}

			switch action {
			case "counter":
				body := map[string]any{"items": []map[string]any{tradeLine(w.material, "7", "10")}}
				status(t, stranger.c.Do("POST", path+"/offer", body), 404)
				status(t, w.buyer.c.Do("POST", path+"/offer", body), 403)
				tradeOffer(t, w.seller, id, w.material, "7", "10")
				status(t, w.buyer.c.Do("POST", path+"/accept", map[string]any{"offer_version": 1}), 409)
				request := status(t, w.buyer.c.Do("GET", path, nil), 200)
				if request.Body["offer_version"] != float64(2) || request.Body["offer_by"] != w.seller.id {
					t.Fatal("counter did not advance author/version")
				}
				holdDecimal(t, tradeText(t, w.app, `SELECT weight::text FROM stock_holds WHERE request_id=$1 AND status='active'`, id), "7")
			case "expiry":
				marketExpire(t, w, id)
			case "withdraw":
				status(t, w.seller.c.Do("POST", path+"/withdraw", nil), 403)
				status(t, w.buyer.c.Do("POST", path+"/withdraw", nil), 200)
			case "reject":
				status(t, w.seller.c.Do("POST", path+"/reject", nil), 200)
			case "cancel":
				status(t, w.seller.c.Do("POST", path+"/cancel", nil), 403)
				status(t, w.buyer.c.Do("POST", path+"/cancel", nil), 200)
			}

			if got := tradeText(t, w.app, `SELECT status FROM transactions WHERE id=$1`, tx); got != "cancelled" {
				t.Fatalf("pending row after %s: %s", action, got)
			}
			request := status(t, w.buyer.c.Do("GET", path, nil), 200)
			if request.Body["buyer_confirmed_version"] != nil || request.Body["seller_confirmed_version"] != nil {
				t.Fatal("old confirmations survived")
			}
			if action == "withdraw" {
				holdCount(t, w, "active", "1")
				holdDecimal(t, tradeText(t, w.app, `SELECT weight::text FROM stock_holds
					WHERE request_id=$1 AND status='active'`, id), "10")
				holdDecimal(t, status(t, w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200).
					Body["weight"], "90")
			} else if action != "counter" {
				holdCount(t, w, "active", "0")
			}
			if len(tradeItems(w.buyer.c.Do("GET", "/api/transactions", nil))) != 0 {
				t.Fatal("cancelled trade counted as complete")
			}
			exported := status(t, w.buyer.c.Do("GET", "/api/privacy/export", nil), 200)
			rows := exported.Body["transactions"].([]any)
			if len(rows) != 1 || rows[0].(map[string]any)["status"] != "cancelled" {
				t.Fatal("privacy export lost cancelled trade/status")
			}
			if action == "cancel" || action == "reject" {
				status(t, tradeSay(t, w.seller, id, "Closed"), 409)
			}
		})
	}
}

func TestMarketPrivacyCancelsPending(t *testing.T) {
	w := newTradeWorld(t)
	id := marketRequest(t, w, "10")
	tradeOffer(t, w.seller, id, w.material, "9", "10")
	status(t, w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	status(t, w.buyer.c.Do("POST", "/api/privacy/delete", map[string]any{"password": goodPassword}), 200)

	if got := tradeText(t, w.app, `SELECT status FROM transactions WHERE request_id=$1`, id); got != "cancelled" {
		t.Fatalf("privacy erase left %s transaction", got)
	}
	holdCount(t, w, "active", "0")
}

func TestMarketDirectSalesComplete(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeSale(t, w.seller, w.buyer, w.material, "5", "9")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000021")
	res := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "1", "6"))), 200)

	for _, transaction := range []string{id, res.Body["transaction_id"].(string)} {
		if got := tradeText(t, w.app, `SELECT status FROM transactions WHERE id=$1`, transaction); got != "complete" {
			t.Fatalf("direct trade status %s", got)
		}
	}
}

func TestMarketConcurrentCheckout(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	start := make(chan struct{})
	results := make(chan testutil.Response, 2)
	for _, buyer := range []tradeUser{w.buyer, other} {
		go func() {
			<-start
			results <- buyer.c.Do("POST", "/api/requests", map[string]any{
				"seller_id": w.seller.id,
				"items":     []map[string]any{{"stock_id": w.stock, "weight": "100"}},
			})
		}()
	}

	close(start)
	counts := map[int]int{}
	for range 2 {
		result := <-results
		counts[result.Status]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("concurrent checkout statuses: %v", counts)
	}
	holdCount(t, w, "active", "1")
}

func TestMarketMigrationBackfillsComplete(t *testing.T) {
	db := testutil.NewDB(t)
	ctx := context.Background()
	_, err := db.Pool.Exec(ctx, `
		ALTER TABLE transactions DROP COLUMN status CASCADE, DROP COLUMN request_id, DROP COLUMN offer_version;
		ALTER TABLE cart_items DROP COLUMN weight;
		ALTER TABLE transaction_request_items DROP COLUMN requested_weight, DROP COLUMN requested_price;
		ALTER TABLE transaction_requests DROP COLUMN offer_by, DROP COLUMN offer_version,
			DROP COLUMN buyer_confirmed_version, DROP COLUMN seller_confirmed_version;
		INSERT INTO users(id,email) VALUES('old-buyer','old-buyer@test.invalid');
		INSERT INTO transactions(id,seller_id,buyer_id,type,total_price) VALUES('old-trade','old-seller','old-buyer','b2b',5)`)
	if err != nil {
		t.Fatal(err)
	}

	migration, err := os.ReadFile("../internal/platform/database/migrations/0015_market_flow.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, string(migration)); err != nil {
		t.Fatal(err)
	}

	var state string
	if err := db.Pool.QueryRow(ctx, `SELECT status FROM transactions WHERE id='old-trade'`).Scan(&state); err != nil || state != "complete" {
		t.Fatalf("backfill: %s %v", state, err)
	}
}
