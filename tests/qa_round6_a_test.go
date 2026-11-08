package tests

import (
	"fmt"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

// Offer and counter: the price stops at R 100 000.00 and the weight at stock.
func TestQARound6AOfferPriceAndWeightLimits(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	path := "/api/requests/" + id + "/offer"
	offer := func(weight, price string) map[string]any {
		return map[string]any{"items": []map[string]any{tradeLine(w.material, weight, price)}}
	}

	for _, test := range []struct{ name, weight, price string }{
		{"over the cap", "10", "100000.01"},
		{"far over the cap", "10", "999999999"},
		{"three decimals", "10", "9.999"},
		{"zero", "10", "0"},
		{"over stock", "100.01", "9"},
	} {
		res := w.seller.c.Do("POST", path, offer(test.weight, test.price))
		if res.Status < 400 || res.Status >= 500 {
			t.Fatalf("%s: status %d: %s", test.name, res.Status, res.Raw)
		}
	}

	// A refused offer leaves nothing behind.
	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id = $1`, id); got != "pending" {
		t.Fatalf("status after refused offers: %s", got)
	}

	capped := w.seller.c.Do("POST", path, offer("10", "100000.01"))
	if !strings.Contains(string(capped.Raw), "R 100000.00 per kg or less") {
		t.Fatalf("cap message: %s", capped.Raw)
	}

	// The limits themselves are allowed, for the offer and for the counter.
	tradeWant(t, "at the cap and the stock", w.seller.c.Do("POST", path, offer("100", "100000.00")), 200)
	tradeWant(t, "counter at the cap", w.buyer.c.Do("POST", path, offer("100", "100000.00")), 200)
	tradeWant(t, "counter over the cap", w.seller.c.Do("POST", path, offer("100", "100000.01")), 400)
}

// Collector Sales follows the collection date; the dashboard's recent list
// follows when rows were recorded.
func TestQARound6ACollectorSalesOrder(t *testing.T) {
	w := newTradeWorld(t)
	user := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, user.phone)

	insert := func(day, created string) string {
		id := database.NewID()
		tradeExec(t, w.app, `INSERT INTO transactions
			(id,seller_id,buyer_id,type,total_price,status,collection_day,created_at)
			VALUES ($1,$2,$3,'c2b',1,'complete',$4,$5::timestamptz)`,
			id, collector, w.buyer.id, day, created)
		tradeExec(t, w.app, `INSERT INTO transaction_items
			(transaction_id,material_id,weight,price,position) VALUES ($1,$2,1,1,0)`, id, w.material)

		return id
	}

	// Recorded last, but collected on the oldest day.
	oldDay := insert("2026-10-01", "2026-11-02T12:00:05Z")
	newDay := insert("2026-11-01", "2026-11-02T12:00:01Z")
	sameDayLater := insert("2026-11-01", "2026-11-02T12:00:02Z")

	sales := pageItems(t, status(t, user.c.Do("GET", "/api/transactions/sales?limit=50", nil), 200))
	want := []string{sameDayLater, newDay, oldDay}

	for i, id := range want {
		if sales[i]["id"] != id {
			t.Fatalf("sales row %d = %v, want %s", i, sales[i]["id"], id)
		}
	}

	recent := pageItems(t, status(t,
		user.c.Do("GET", "/api/transactions/sales?limit=50&order=recorded", nil), 200))
	want = []string{oldDay, sameDayLater, newDay}

	for i, id := range want {
		if recent[i]["id"] != id {
			t.Fatalf("recorded row %d = %v, want %s", i, recent[i]["id"], id)
		}
	}

	// Paging in recorded order visits every row once.
	first := status(t, user.c.Do("GET", "/api/transactions/sales?limit=2&order=recorded", nil), 200)
	second := status(t, user.c.Do("GET",
		"/api/transactions/sales?limit=2&order=recorded&cursor="+first.Body["next_cursor"].(string), nil), 200)

	if pageItems(t, second)[0]["id"] != newDay {
		t.Fatalf("recorded cursor: %s", second.Raw)
	}

	status(t, user.c.Do("GET", "/api/transactions/sales?order=nonsense", nil), 400)
}

// Root cause of the same-day order bug: a row with no collection day counted at
// its raw created time, so it sorted above same-day rows that count at midnight.
func TestQARound6ASameDayRowsShareOneDay(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800006001")

	// 10:00 SAST on 3 Nov, a seeded-style row with no collection day.
	early := database.NewID()
	tradeExec(t, w.app, `INSERT INTO transactions (id,seller_id,buyer_id,type,total_price,status,created_at)
		VALUES ($1,$2,$3,'c2b',1,'complete','2026-11-03T08:00:00Z')`, early, collector, w.buyer.id)

	// Recorded later the same SAST day, with a collection day of that date.
	late := database.NewID()
	tradeExec(t, w.app, `INSERT INTO transactions
		(id,seller_id,buyer_id,type,total_price,status,collection_day,created_at)
		VALUES ($1,$2,$3,'c2b',1,'complete','2026-11-03','2026-11-03T14:00:00Z')`,
		late, collector, w.buyer.id)

	rows := pageItems(t, status(t, w.buyer.c.Do("GET", "/api/transactions/purchases?limit=10", nil), 200))
	if len(rows) != 2 || rows[0]["id"] != late || rows[1]["id"] != early {
		t.Fatalf("same-day order: %v", rows)
	}

	// Both count on the same day, and nothing stored was rewritten.
	if rows[0]["effective_at"] != rows[1]["effective_at"] {
		t.Fatalf("effective_at differs: %v vs %v", rows[0]["effective_at"], rows[1]["effective_at"])
	}

	if got := tradeText(t, w.app, `SELECT created_at::text FROM transactions WHERE id=$1`, early); !strings.HasPrefix(got, "2026-11-03 08:00:00") {
		t.Fatalf("created_at changed: %s", got)
	}
}

// Finishing or ending a request marks its offer messages read, and a review
// message names the buyer and the stars.
func TestQARound6AOfferNotificationsAndReviewBody(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, id, w.material, "10", "9")

	unread := func(user tradeUser) string {
		return tradeText(t, w.app, `SELECT count(*)::text FROM notifications
			WHERE user_id=$1 AND NOT read AND title IN ('Offer received','Please confirm the offer')`, user.id)
	}

	if unread(w.buyer) != "1" {
		t.Fatal("buyer should have an unread offer message")
	}

	tradeWant(t, "buyer accepts", w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)

	if unread(w.seller) != "1" {
		t.Fatal("seller should be asked to confirm")
	}

	tradeWant(t, "seller confirms", w.seller.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)

	if unread(w.buyer) != "0" || unread(w.seller) != "0" {
		t.Fatal("offer messages stay unread after the trade completed")
	}

	// Rejecting an offer clears it too.
	second := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, second, w.material, "5", "9")
	tradeWant(t, "buyer cancels", w.buyer.c.Do("POST", "/api/requests/"+second+"/cancel", nil), 200)

	if unread(w.buyer) != "0" {
		t.Fatal("offer message stays unread after the request was cancelled")
	}

	tx := tradeText(t, w.app, `SELECT id FROM transactions WHERE request_id=$1`, id)
	status(t, w.buyer.c.Do("POST", "/api/transactions/"+tx+"/review", map[string]any{"rating": 4}), 200)

	body := tradeText(t, w.app, `SELECT body FROM notifications
		WHERE user_id=$1 AND title='New trade review'`, w.seller.id)
	want := fmt.Sprintf("%s gave you 4 stars.", "Biz "+w.buyer.id[:6])

	if body != want {
		t.Fatalf("review body %q, want %q", body, want)
	}
}

// The invoice email states the total, and an admin's full-identifier view of an
// invoice names the invoice number.
func TestQARound6AInvoiceTotalAndPrivacyEvent(t *testing.T) {
	w := newTradeWorld(t)
	tradeExec(t, w.app, `UPDATE users SET bank_account_holder_name='Holder',bank_name='Bank',
		bank_account_number=$2,bank_branch_code='250655',bank_account_type='Cheque' WHERE id=$1`,
		w.seller.id, testutil.Seal(t, "123456789"))
	admin := tradeNewUser(t, w.app, "admin")
	id := tradeSale(t, w.seller, w.buyer, w.material, "100", "19.99")
	number := strings.ToUpper(id[len(id)-8:])

	mail := testutil.WaitMail(t, w.buyer.email, "Your 3REco invoice "+number)
	if !strings.Contains(mail.Text, "Total R 1 999.00.") {
		t.Fatalf("invoice email lacks the total: %s", mail.Text)
	}

	status(t, admin.c.Do("GET", "/api/transactions/"+id+"/invoice", nil), 200)

	var found bool

	for _, event := range pageItems(t, status(t, admin.c.Do("GET", "/api/admin/privacy-events", nil), 200)) {
		details, _ := event["details"].(map[string]any)
		if event["kind"] == "admin_full_view" && details["invoice_number"] == number {
			found = true
		}
	}

	if !found {
		t.Fatalf("no admin_full_view event names invoice %s", number)
	}
}
