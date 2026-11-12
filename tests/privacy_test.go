package tests

import (
	"context"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/tests/testutil"
)

// privacyColumn reads one raw database value, so a test sees what is at rest.
func privacyColumn(t *testing.T, app *testutil.App, sql string, args ...any) string {
	t.Helper()

	return tradeText(t, app, sql, args...)
}

// privacyCollector makes a collector through the API as the business and
// returns its id.
func privacyCollector(t *testing.T, creator *testutil.Client) string {
	t.Helper()

	body := status(t, creator.Do("POST", "/api/collectors", collectorBody(domainPhone())), 200).Body

	return body["id"].(string)
}

// privacyWallet makes an e-wallet collector through the API and returns its id.
func privacyWallet(t *testing.T, creator *testutil.Client) string {
	t.Helper()

	body := status(t, creator.Do("POST", "/api/collectors", map[string]any{
		"name": "Wallet Collector", "phone": domainPhone(), "payout_method": "ewallet",
		"ewallet_platform_name": "Wallet", "ewallet_payment_id": "0821112222",
		"street_address": "Street", "city": "Cape Town", "province": "Western Cape", "area_code": 8000,
	}), 200).Body

	return body["id"].(string)
}

// walk calls fn for every key and string value in a decoded JSON tree.
func walk(value any, key func(string), text func(string)) {
	switch node := value.(type) {
	case map[string]any:
		for name, child := range node {
			key(name)
			walk(child, key, text)
		}
	case []any:
		for _, child := range node {
			walk(child, key, text)
		}
	case string:
		text(node)
	}
}

func TestPrivacyFieldsAreCiphertextAtRest(t *testing.T) {
	w := newTradeWorld(t)

	status(t, w.seller.c.Do("PATCH", "/api/profile", map[string]any{
		"id_number": "8001015009087", "bank_account_holder_name": "Holder", "bank_name": "Bank",
		"bank_account_number": "62001234567", "bank_branch_code": "250655", "bank_account_type": "Savings",
	}), 200)

	collector := privacyCollector(t, w.buyer.c)
	wallet := privacyWallet(t, w.buyer.c)

	// The sale freezes a copy of the collector on the trade.
	bankTrade := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "2", "3.25"))), 200).Body["transaction_id"].(string)
	walletTrade := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(wallet, "", tradeLine(w.material, "2", "3.25"))), 200).Body["transaction_id"].(string)

	raw := map[string][2]string{
		"users.id_number":              {"SELECT id_number FROM users WHERE id=$1", w.seller.id},
		"users.bank_account_number":    {"SELECT bank_account_number FROM users WHERE id=$1", w.seller.id},
		"collectors.bank_account":      {"SELECT bank_account_number FROM collectors WHERE id=$1", collector},
		"collectors.ewallet_id":        {"SELECT ewallet_payment_id FROM collectors WHERE id=$1", wallet},
		"snapshot.bank_account_number": {"SELECT collector_snapshot->>'bank_account_number' FROM transactions WHERE id=$1", bankTrade},
		"snapshot.ewallet_payment_id":  {"SELECT collector_snapshot->>'ewallet_payment_id' FROM transactions WHERE id=$1", walletTrade},
	}

	plain := map[string]string{
		"users.id_number": "8001015009087", "users.bank_account_number": "62001234567",
		"collectors.bank_account": "123456789", "collectors.ewallet_id": "0821112222",
		"snapshot.bank_account_number": "123456789", "snapshot.ewallet_payment_id": "0821112222",
	}

	for name, query := range raw {
		got := privacyColumn(t, w.app, query[0], query[1])

		if !strings.HasPrefix(got, "v1:") {
			t.Errorf("%s at rest = %q, want the v1: prefix", name, got)
		}

		if strings.Contains(got, plain[name]) {
			t.Errorf("%s at rest still holds the plain value", name)
		}
	}

	// The owner reads their own account number whole and the id masked; the export has both in full.
	own := status(t, w.seller.c.Do("GET", "/api/profile", nil), 200).Body
	if own["id_number"] != "******9087" || own["bank_account_number"] != "62001234567" {
		t.Errorf("owner's own profile is not readable: %v", own)
	}
}

func TestPrivacyMaskAndFullView(t *testing.T) {
	app := testutil.Server(t)
	creator := tradeNewUser(t, app, "business")
	other := tradeNewUnverified(t, app)
	staff := tradeNewUser(t, app, "staff")
	admin := tradeNewUser(t, app, "admin")
	login := tradeNewUser(t, app, "collector")
	stranger := tradeNewUser(t, app, "collector")

	collector := privacyCollector(t, creator.c)
	wallet := privacyWallet(t, creator.c)

	// The linked login is the user with the same canonical phone number.
	tradeExec(t, app, `UPDATE users SET normalized_phone =
		(SELECT normalized_phone FROM collectors WHERE id=$2) WHERE id=$1`, login.id, collector)

	view := func(who tradeUser) map[string]any {
		return status(t, who.c.Do("GET", "/api/collectors/"+collector, nil), 200).Body
	}

	for name, who := range map[string]tradeUser{"creator": creator, "admin": admin, "linked login": login} {
		got := view(who)
		if got["bank_account_number"] != "123456789" {
			t.Errorf("%s should see the full values: %v", name, got)
		}

		// The login is linked to the bank collector only, so the wallet is not theirs.
		if name == "linked login" {
			continue
		}

		if w := status(t, who.c.Do("GET", "/api/collectors/"+wallet, nil), 200).Body; w["ewallet_payment_id"] != "0821112222" {
			t.Errorf("%s should see the full e-wallet id: %v", name, w)
		}
	}

	for name, who := range map[string]tradeUser{"staff": staff, "other business": other, "other login": stranger} {
		got := view(who)
		if got["bank_account_number"] != "******6789" {
			t.Errorf("%s should see the masked values: %v", name, got)
		}

		if w := status(t, who.c.Do("GET", "/api/collectors/"+wallet, nil), 200).Body; w["ewallet_payment_id"] != "******2222" {
			t.Errorf("%s should see the masked e-wallet id: %v", name, w)
		}
	}

	// Staff still manage the record: they see contact details, only masked numbers.
	if view(staff)["email"] != "collector@example.test" {
		t.Error("staff lost the contact details")
	}

	// A masked value sent back from a form means "unchanged", never a new number.
	status(t, staff.c.Do("PATCH", "/api/collectors/"+collector, map[string]any{
		"bank_account_number": "******6789", "city": "Paarl",
	}), 200)

	if got := view(creator)["bank_account_number"]; got != "123456789" {
		t.Errorf("a masked value overwrote the account number: %v", got)
	}

	// The linked login may read but not change the record.
	status(t, login.c.Do("PATCH", "/api/collectors/"+collector, map[string]any{"city": "X"}), 403)
}

func TestPrivacyNoticeFlow(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)

	for name, body := range map[string]map[string]any{
		"no version":    {"name": "No Version", "email": testutil.Email("nover"), "password": goodPassword},
		"wrong version": {"name": "Old", "email": testutil.Email("oldver"), "password": goodPassword, "accepted_terms_version": "1999-01"},
	} {
		res := c.Do("POST", "/api/auth/sign-up", body)
		if res.Status != 400 {
			t.Errorf("sign-up %s: %d, want 400 (%s)", name, res.Status, res.Raw)
		}
	}

	user := tradeNewUser(t, app, "business")

	// Sign-up with the current version records it.
	notice := status(t, user.c.Do("GET", "/api/privacy/notice", nil), 200).Body
	if notice["version"] != config.NoticeVersion || notice["accepted"] != true {
		t.Errorf("notice after sign-up: %v", notice)
	}

	// A person on an older notice has not accepted the current one until they accept.
	tradeExec(t, app, `DELETE FROM privacy_notice_acceptances WHERE user_id=$1`, user.id)

	if got := status(t, user.c.Do("GET", "/api/privacy/notice", nil), 200).Body["accepted"]; got != false {
		t.Errorf("accepted before accepting: %v", got)
	}

	status(t, user.c.Do("POST", "/api/privacy/notice/accept", nil), 200)

	if got := status(t, user.c.Do("GET", "/api/privacy/notice", nil), 200).Body["accepted"]; got != true {
		t.Errorf("accepted after accepting: %v", got)
	}

	status(t, app.NewClient(t).Do("GET", "/api/privacy/notice", nil), 401)
	status(t, app.NewClient(t).Do("POST", "/api/privacy/notice/accept", nil), 401)
}

func TestPrivacyRefusesToStartWithoutKey(t *testing.T) {
	for name, key := range map[string]string{
		"missing": "", "not base64": "!!!", "too short": "c2hvcnQ=",
	} {
		_, err := testutilServerErr(t, key)
		if err == nil {
			t.Errorf("%s key: the server started", name)
		}
	}
}

// testutilServerErr starts the module the way testutil.Server does, but with a
// chosen key, and returns the start error instead of failing the test.
func testutilServerErr(t *testing.T, key string) (*testutil.App, error) {
	t.Helper()

	return testutil.TryServer(t, func(cfg *config.Config) { cfg.FieldKey = key })
}

func TestPrivacyCollectorLoginCountsOnlyWithSamePhone(t *testing.T) {
	app := testutil.Server(t)
	creator := tradeNewUser(t, app, "business")
	login := tradeNewUser(t, app, "collector")
	collector := privacyCollector(t, creator.c)

	// Not linked yet: the login sees only the mask.
	got := status(t, login.c.Do("GET", "/api/collectors/"+collector, nil), 200).Body
	if got["bank_account_number"] != "******6789" {
		t.Errorf("unlinked login: %v", got)
	}

	_, err := app.DB.Pool.Exec(context.Background(),
		`UPDATE users SET normalized_phone = (SELECT normalized_phone FROM collectors WHERE id=$2)
		WHERE id=$1`, login.id, collector)
	if err != nil {
		t.Fatal(err)
	}

	got = status(t, login.c.Do("GET", "/api/collectors/"+collector, nil), 200).Body
	if got["bank_account_number"] != "123456789" {
		t.Errorf("linked login: %v", got)
	}
}

func TestPrivacyNoticeTextIsPublic(t *testing.T) {
	app := testutil.Server(t)
	got := status(t, app.NewClient(t).Do("GET", "/api/privacy/notice/current", nil), 200).Body

	if got["version"] != config.NoticeVersion || got["terms"] == "" || got["privacy"] == "" {
		t.Fatalf("notice text: %v", got)
	}
}
