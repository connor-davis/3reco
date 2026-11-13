package tests

import (
	"bytes"
	"context"
	"slices"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// privacyKinds lists the audit kinds the admin sees for one subject.
func privacyKinds(t *testing.T, admin tradeUser, subject string) []string {
	t.Helper()

	var kinds []string

	for _, item := range pageItems(t, status(t, admin.c.Do("GET", "/api/admin/privacy-events", nil), 200)) {
		if item["subject_id"] == subject || (subject == "" && item["subject_id"] == nil) {
			kinds = append(kinds, item["kind"].(string))
		}
	}

	return kinds
}

func TestPrivacyExportIsOwnDataOnly(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")

	status(t, w.seller.c.Do("PATCH", "/api/profile", map[string]any{
		"id_number": "8001015009087", "bank_account_holder_name": "Holder", "bank_name": "Bank",
		"bank_account_number": "62001234567", "bank_branch_code": "250655", "bank_account_type": "Savings",
	}), 200)

	// The other side has private values the seller must never get back.
	tradeExec(t, w.app, `UPDATE users SET id_number=$2, bank_account_number=$3 WHERE id=$1`,
		w.buyer.id, testutil.Seal(t, "BUYER-ID"), testutil.Seal(t, "BUYER-BANK"))
	theirs := privacyCollector(t, w.buyer.c)
	status(t, w.buyer.c.Do("PATCH", "/api/collectors/"+theirs, map[string]any{
		"bank_account_number": "999888777",
	}), 200)
	mine := privacyCollector(t, w.seller.c)
	tradeRequest(t, w.buyer, w.seller, w.stock)

	got := status(t, w.seller.c.Do("GET", "/api/privacy/export", nil), 200)
	if got.Body["profile"].(map[string]any)["id_number"] != "8001015009087" {
		t.Errorf("own id number missing from the export: %v", got.Body["profile"])
	}

	for _, section := range []string{"profile", "sessions", "notice_acceptances", "stock", "requests",
		"transactions", "reviews", "notifications", "carts", "collectors_created", "exported_at"} {
		if _, ok := got.Body[section]; !ok {
			t.Errorf("export has no %q section", section)
		}
	}

	if len(got.Body["stock"].([]any)) == 0 || len(got.Body["requests"].([]any)) == 0 {
		t.Error("export left out the caller's stock or requests")
	}

	created := got.Body["collectors_created"].([]any)
	if len(created) != 1 || created[0].(map[string]any)["id"] != mine {
		t.Errorf("collectors_created should hold only my own collector: %v", created)
	}

	secret := map[string]bool{
		"password_hash": true, "token_hash": true, "collector_snapshot": true, "normalized_phone": true,
	}
	private := map[string]bool{"BUYER-ID": true, "BUYER-BANK": true, "999888777": true, theirs: true}

	walk(got.Body, func(key string) {
		if secret[key] {
			t.Errorf("export has the secret key %q", key)
		}
	}, func(text string) {
		if private[text] {
			t.Errorf("export has another person's private value %q", text)
		}
	})

	// A stranger's export holds nothing that belongs to the seller.
	other := status(t, stranger.c.Do("GET", "/api/privacy/export", nil), 200)
	walk(other.Body, func(string) {}, func(text string) {
		if text == w.seller.id || text == "8001015009087" || text == w.seller.email {
			t.Errorf("a stranger's export holds the seller's %q", text)
		}
	})

	status(t, w.app.NewClient(t).Do("GET", "/api/privacy/export", nil), 401)

	admin := tradeNewUser(t, w.app, "admin")
	if !slices.Contains(privacyKinds(t, admin, w.seller.id), "export") {
		t.Error("the export was not written to the audit log")
	}
}

func TestPrivacyDeleteAnonymisesAndCancels(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")
	admin := tradeNewUser(t, w.app, "admin")
	ctx := context.Background()

	request := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeNote(t, w, w.seller, "n1")
	owned := privacyCollector(t, w.seller.c)

	status(t, uploadImage(t, w.app, w.seller.c, "/api/profile/avatar", receiptImage(1)), 200)
	avatar := tradeText(t, w.app, `SELECT avatar_key FROM users WHERE id=$1`, w.seller.id)

	if avatar == "" {
		t.Fatal("the avatar was not stored")
	}

	body := map[string]any{"password": "not my password"}

	// Wrong password: refused, and nothing is touched.
	status(t, w.seller.c.Do("POST", "/api/privacy/delete", body), 400)
	status(t, w.seller.c.Do("GET", "/api/auth/me", nil), 200)

	if reader, err := w.app.Storage.Get(ctx, avatar); err != nil {
		t.Fatalf("a refused delete removed the avatar: %v", err)
	} else {
		_ = reader.Close()
	}

	// No id on the route: a stranger with their own password only reaches themselves.
	status(t, w.app.NewClient(t).Do("POST", "/api/privacy/delete", map[string]any{"password": goodPassword}), 401)

	if tradeText(t, w.app, `SELECT is_removed::text FROM users WHERE id=$1`, w.seller.id) != "false" {
		t.Fatal("the seller was removed before they asked")
	}

	status(t, w.seller.c.Do("POST", "/api/privacy/delete", map[string]any{"password": goodPassword}), 200)

	// Their old cookie is dead, and the person is anonymised.
	status(t, w.seller.c.Do("GET", "/api/auth/me", nil), 401)
	tradeWant(t, "old session", w.seller.c.Do("GET", "/api/notifications", nil), 401)

	if got := tradeText(t, w.app, `SELECT email FROM users WHERE id=$1`, w.seller.id); got != "" {
		t.Errorf("the email survived: %q", got)
	}

	if tradeText(t, w.app, `SELECT is_removed::text FROM users WHERE id=$1`, w.seller.id) != "true" {
		t.Error("the user is not marked removed")
	}

	for _, sql := range []string{
		`SELECT count(*)::text FROM sessions WHERE user_id=$1`,
		`SELECT count(*)::text FROM notifications WHERE user_id=$1`,
		`SELECT count(*)::text FROM stock WHERE owner_id=$1`,
		`SELECT count(*)::text FROM carts WHERE seller_id=$1 OR buyer_id=$1`,
		`SELECT count(*)::text FROM auth_tokens WHERE user_id=$1`,
	} {
		if n := tradeText(t, w.app, sql, w.seller.id); n != "0" {
			t.Errorf("%s: %s rows left", sql, n)
		}
	}

	if tradeText(t, w.app, `SELECT count(*)::text FROM collectors WHERE id=$1`, owned) != "0" {
		t.Error("a collector the person created was not scrubbed")
	}

	// The open request is cancelled with the normal status, and the buyer is told.
	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id=$1`, request); got != "cancelled" {
		t.Errorf("open request status %q, want cancelled", got)
	}

	if tradeText(t, w.app, `SELECT count(*)::text FROM notifications WHERE user_id=$1
		AND title='Request cancelled'`, w.buyer.id) != "1" {
		t.Error("the buyer was not told the request was cancelled")
	}

	// The avatar object goes only after the commit, so it is gone now.
	if reader, err := w.app.Storage.Get(ctx, avatar); err == nil {
		_ = reader.Close()
		t.Error("the avatar object is still stored")
	}

	if got := tradeText(t, w.app, `SELECT COALESCE(avatar_key,'') FROM users WHERE id=$1`, w.seller.id); got != "" {
		t.Errorf("the avatar key survived: %q", got)
	}

	// A stranger is unaffected, and the audit log has the delete.
	status(t, stranger.c.Do("GET", "/api/auth/me", nil), 200)

	if !slices.Contains(privacyKinds(t, admin, w.seller.id), "delete") {
		t.Error("the delete was not written to the audit log")
	}
}

func TestPrivacyEventsAreAdminOnly(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")

	status(t, w.seller.c.Do("GET", "/api/privacy/export", nil), 200)

	status(t, w.app.NewClient(t).Do("GET", "/api/admin/privacy-events", nil), 401)
	status(t, w.seller.c.Do("GET", "/api/admin/privacy-events", nil), 403)
	status(t, staff.c.Do("GET", "/api/admin/privacy-events", nil), 403)

	// An admin reading someone else's collector in full is written down, and so
	// is the CSV of payout details.
	creator := w.buyer
	collector := privacyCollector(t, creator.c)
	status(t, admin.c.Do("GET", "/api/collectors/"+collector, nil), 200)

	got := privacyKinds(t, admin, collector)
	if !slices.Contains(got, "admin_full_view") {
		t.Errorf("admin full view of a collector not logged: %v", got)
	}

	status(t, creator.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "2", "3.25"))), 200)

	before := len(privacyKinds(t, admin, collector))
	csvRows(t, admin.c, "/api/admin/exports/transactions")

	if len(privacyKinds(t, admin, collector)) != before+1 {
		t.Error("the admin CSV with full payout details was not logged")
	}

	// Staff and the creating business do not leave an admin_full_view line.
	csvRows(t, staff.c, "/api/admin/exports/transactions")
	csvRows(t, creator.c, "/api/exports/collections")

	if len(privacyKinds(t, admin, collector)) != before+1 {
		t.Error("only an admin full view should be logged")
	}
}

func TestPrivacyRetention(t *testing.T) {
	w := newTradeWorld(t)
	ctx := context.Background()

	collector := privacyCollector(t, w.buyer.c)
	oldTrade := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "2", "3.25"))), 200).Body["transaction_id"].(string)
	newTrade := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "4", "1.50"))), 200).Body["transaction_id"].(string)

	tradeExec(t, w.app, `UPDATE transactions SET created_at = now() - interval '6 years' WHERE id=$1`, oldTrade)
	tradeExec(t, w.app, `UPDATE transactions SET created_at = now() - interval '4 years' WHERE id=$1`, newTrade)

	tradeNote(t, w, w.seller, "old-note")
	tradeNote(t, w, w.seller, "new-note")
	tradeExec(t, w.app, `UPDATE notifications SET created_at = now() - interval '100 days' WHERE id='old-note'`)

	tradeExec(t, w.app, `INSERT INTO carts (id, buyer_id, seller_id, updated_at)
		VALUES ('old-cart', $1, $2, now() - interval '100 days'), ('new-cart', $2, $1, now())`,
		w.buyer.id, w.seller.id)

	tradeExec(t, w.app, `INSERT INTO privacy_events (id, actor_id, subject_id, kind, created_at)
		VALUES ('old-event', $1, $1, 'export', now() - interval '3 years')`, w.seller.id)

	// Running it twice does the same as running it once.
	for range 2 {
		if err := w.app.Privacy.Retain(ctx); err != nil {
			t.Fatal(err)
		}
	}

	count := func(sql string) string { return tradeText(t, w.app, sql) }

	if count(`SELECT count(*)::text FROM notifications WHERE id='old-note'`) != "0" ||
		count(`SELECT count(*)::text FROM notifications WHERE id='new-note'`) != "1" {
		t.Error("notifications: only the old one should go")
	}

	if count(`SELECT count(*)::text FROM carts WHERE id='old-cart'`) != "0" ||
		count(`SELECT count(*)::text FROM carts WHERE id='new-cart'`) != "1" {
		t.Error("carts: only the forgotten one should go")
	}

	if count(`SELECT count(*)::text FROM privacy_events WHERE id='old-event'`) != "0" {
		t.Error("an audit line older than two years was kept")
	}

	// The old trade lost its personal details but kept amounts, materials and dates.
	if count(`SELECT (collector_snapshot IS NULL AND anonymised_at IS NOT NULL)::text
		FROM transactions WHERE id='`+oldTrade+`'`) != "true" {
		t.Error("the 6 year old trade was not anonymised")
	}

	if count(`SELECT total_price::text FROM transactions WHERE id='`+oldTrade+`'`) != "6.50" {
		t.Error("anonymising changed the amount")
	}

	if count(`SELECT count(*)::text FROM transaction_items WHERE transaction_id='`+oldTrade+`'`) != "1" {
		t.Error("anonymising removed the items")
	}

	if count(`SELECT (collector_snapshot IS NOT NULL AND anonymised_at IS NULL)::text
		FROM transactions WHERE id='`+newTrade+`'`) != "true" {
		t.Error("a 4 year old trade must be left alone")
	}

	// Its invoice is no longer kept.
	status(t, w.buyer.c.Do("GET", "/api/transactions/"+oldTrade+"/invoice", nil), 404)
}

func TestPrivacyImportEncryptsAndRecordsLegacyNotice(t *testing.T) {
	app, _ := importFixture(t)

	for name, sql := range map[string]string{
		"users.id_number":          `SELECT count(*)::text FROM users WHERE id_number <> '' AND id_number NOT LIKE 'v1:%'`,
		"users.bank_account":       `SELECT count(*)::text FROM users WHERE bank_account_number <> '' AND bank_account_number NOT LIKE 'v1:%'`,
		"collectors.bank_account":  `SELECT count(*)::text FROM collectors WHERE bank_account_number <> '' AND bank_account_number NOT LIKE 'v1:%'`,
		"collectors.ewallet":       `SELECT count(*)::text FROM collectors WHERE ewallet_payment_id <> '' AND ewallet_payment_id NOT LIKE 'v1:%'`,
		"snapshot.bank_account":    `SELECT count(*)::text FROM transactions WHERE COALESCE(collector_snapshot->>'bank_account_number','') NOT IN ('') AND collector_snapshot->>'bank_account_number' NOT LIKE 'v1:%'`,
		"snapshot.ewallet_payment": `SELECT count(*)::text FROM transactions WHERE COALESCE(collector_snapshot->>'ewallet_payment_id','') NOT IN ('') AND collector_snapshot->>'ewallet_payment_id' NOT LIKE 'v1:%'`,
	} {
		if n := tradeText(t, app, sql); n != "0" {
			t.Errorf("%s: %s imported values are not encrypted", name, n)
		}
	}

	if tradeText(t, app, `SELECT count(*)::text FROM users WHERE id_number LIKE 'v1:%'`) == "0" {
		t.Error("the fixture's ID number was not imported encrypted")
	}

	agreed := tradeText(t, app, `SELECT count(*)::text FROM users WHERE agreed_to_terms AND NOT is_removed`)
	legacy := tradeText(t, app, `SELECT count(*)::text FROM privacy_notice_acceptances WHERE version='legacy'`)

	if agreed == "0" || agreed != legacy {
		t.Errorf("%s people agreed to terms, %s legacy acceptances recorded", agreed, legacy)
	}
}

func TestPrivacyDeleteReleasesTheSellersHold(t *testing.T) {
	w := newTradeWorld(t)
	viewer := tradeNewUser(t, w.app, "business")
	request := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, request, w.material, "40.12", "9")

	listing := func() any {
		return status(t, viewer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200).Body["weight"]
	}

	holdDecimal(t, listing(), "59.88")

	// The buyer erases their account: the seller's stock is free again at once.
	status(t, w.buyer.c.Do("POST", "/api/privacy/delete", map[string]any{"password": goodPassword}), 200)

	holdDecimal(t, listing(), "100")
	holdCount(t, w, "active", "0")
	holdCount(t, w, "released", "2")
}

// A collector list never carries a full identifier, so opening it writes no
// audit line at all. Only the one-collector route, which does carry it for an
// admin, writes a named line.
func TestPrivacyCollectorListAuditsNothing(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	collector := privacyCollector(t, w.buyer.c)

	anonymous := len(privacyKinds(t, admin, ""))

	for _, who := range []tradeUser{w.buyer, staff, w.seller, admin} {
		list := status(t, who.c.Do("GET", "/api/collectors", nil), 200)
		if bytes.Contains(list.Raw, []byte("123456789")) {
			t.Error("a collector list carries a full account number")
		}
	}

	if len(privacyKinds(t, admin, collector)) != 0 {
		t.Error("a list left a full-view line")
	}

	if len(privacyKinds(t, admin, "")) != anonymous {
		t.Error("a line with no subject was written")
	}

	status(t, admin.c.Do("GET", "/api/collectors/"+collector, nil), 200)

	if !slices.Contains(privacyKinds(t, admin, collector), "admin_full_view") {
		t.Error("admin detail showing a full identifier was not logged for that collector")
	}
}
