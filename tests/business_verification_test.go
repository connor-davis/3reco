package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// verifyWorld is an admin, a staff member, two businesses and one collector
// made by each of staff and the first business.
type verifyWorld struct {
	app                      *testutil.App
	admin, staff, bizA, bizB tradeUser
	byBusiness, byStaff      string
	verifyURL                func(id string) string
}

// shown is true when the JSON object carries a non-empty text value for key.
func shown(object map[string]any, key string) bool {
	value, _ := object[key].(string)

	return value != ""
}

func newVerifyWorld(t *testing.T) verifyWorld {
	t.Helper()

	app := testutil.Server(t)
	w := verifyWorld{
		app:   app,
		admin: tradeNewUser(t, app, "admin"),
		staff: tradeNewUser(t, app, "staff"),
		bizA:  tradeNewUnverified(t, app),
		bizB:  tradeNewUnverified(t, app),
		verifyURL: func(id string) string {
			return "/api/admin/users/" + id + "/business-verification"
		},
	}

	w.byBusiness = status(t, w.bizA.c.Do("POST", "/api/collectors", collectorBody(domainPhone())), 200).Body["id"].(string)
	w.byStaff = status(t, w.staff.c.Do("POST", "/api/collectors", collectorBody(domainPhone())), 200).Body["id"].(string)

	return w
}

func (w verifyWorld) setVerified(t *testing.T, id string, verified bool) {
	t.Helper()

	tradeWant(t, "verify", w.admin.c.Do("PUT", w.verifyURL(id), map[string]any{"verified": verified}), 200)
}

func TestUnverifiedBusinessSeesNothingOfOthers(t *testing.T) {
	w := newVerifyWorld(t)

	for name, id := range map[string]string{"business": w.byBusiness, "staff": w.byStaff} {
		got := status(t, w.bizB.c.Do("GET", "/api/collectors/"+id, nil), 200).Body
		if shown(got, "email") || shown(got, "phone") || shown(got, "bank_name") {
			t.Errorf("%s collector leaked contact: %v", name, got)
		}

		if got["bank_account_number"] == "123456789" || got["can_edit"] == true || got["can_view_payout"] == true {
			t.Errorf("%s collector leaked payout or edit rights: %v", name, got)
		}

		tradeWant(t, name+" edit", w.bizB.c.Do("PATCH", "/api/collectors/"+id, map[string]any{"name": "Taken"}), 404)
	}
}

func TestVerifiedBusinessSeesAndEditsEveryCollector(t *testing.T) {
	w := newVerifyWorld(t)
	w.setVerified(t, w.bizB.id, true)

	for name, id := range map[string]string{"business": w.byBusiness, "staff": w.byStaff} {
		got := status(t, w.bizB.c.Do("GET", "/api/collectors/"+id, nil), 200).Body
		if got["email"] != "collector@example.test" || got["bank_account_number"] != "123456789" ||
			got["can_edit"] != true || got["can_view_payout"] != true {
			t.Errorf("%s collector not full for a verified business: %v", name, got)
		}

		tradeWant(t, name+" edit", w.bizB.c.Do("PATCH", "/api/collectors/"+id, map[string]any{"name": "Renamed"}), 200)
		tradeWant(t, name+" delete", w.bizB.c.Do("DELETE", "/api/collectors/"+id, map[string]any{}), 403)
	}

	me, _ := status(t, w.bizB.c.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if me["business_verified"] != true {
		t.Fatalf("session user is not marked verified: %v", me)
	}

	// A different business that is still unverified gains nothing.
	got := status(t, w.bizA.c.Do("GET", "/api/collectors/"+w.byStaff, nil), 200).Body
	if shown(got, "email") || got["can_edit"] == true {
		t.Errorf("unverified business A sees staff collector: %v", got)
	}

	// Verified stats and payout reads follow the same rule.
	phone := tradeText(t, w.app, `SELECT normalized_phone FROM collectors WHERE id = $1`, w.byStaff)
	stats := status(t, w.bizB.c.Do("GET", "/api/collectors/stats?phone="+phone, nil), 200).Body
	if collector, _ := stats["collector"].(map[string]any); !shown(collector, "email") {
		t.Fatalf("verified stats hide the contact: %v", stats)
	}
}

func TestVerificationRouteIsAdminOnly(t *testing.T) {
	w := newVerifyWorld(t)
	guest := tradeNewUser(t, w.app, "guest")

	for name, caller := range map[string]tradeUser{"business": w.bizA, "staff": w.staff, "guest": guest} {
		tradeWant(t, name, caller.c.Do("PUT", w.verifyURL(w.bizB.id), map[string]any{"verified": true}), 403)
	}

	if tradeText(t, w.app, `SELECT business_verified_at::text FROM businesses WHERE id = $1`, w.bizB.id) != "" {
		t.Fatal("a refused call verified the business")
	}

	// Only business accounts can carry it.
	tradeWant(t, "staff target", w.admin.c.Do("PUT", w.verifyURL(w.staff.id), map[string]any{"verified": true}), 400)
	tradeWant(t, "missing flag", w.admin.c.Do("PUT", w.verifyURL(w.bizB.id), map[string]any{}), 400)
	tradeWant(t, "unknown user", w.admin.c.Do("PUT", w.verifyURL("nobody"), map[string]any{"verified": true}), 404)
}

func TestUnverifyTakesAccessAwayAtOnce(t *testing.T) {
	w := newVerifyWorld(t)
	w.setVerified(t, w.bizB.id, true)
	status(t, w.bizB.c.Do("PATCH", "/api/collectors/"+w.byStaff, map[string]any{"name": "Mine now"}), 200)

	w.setVerified(t, w.bizB.id, false)

	got := status(t, w.bizB.c.Do("GET", "/api/collectors/"+w.byStaff, nil), 200).Body
	if shown(got, "email") || got["can_edit"] == true {
		t.Errorf("access stayed after unverify: %v", got)
	}

	tradeWant(t, "edit", w.bizB.c.Do("PATCH", "/api/collectors/"+w.byStaff, map[string]any{"name": "Again"}), 404)

	// The admin list shows the state.
	for _, row := range pageItems(t, status(t, w.admin.c.Do("GET", "/api/admin/users?role=business&limit=50", nil), 200)) {
		if row["id"] == w.bizB.id && row["business_verified"] != false {
			t.Errorf("admin list: %v", row)
		}
	}
}

func TestVerificationNotifiesAndAudits(t *testing.T) {
	w := newVerifyWorld(t)
	socks := joinLive(t, w.app, w.bizB, w.bizA)
	own, other := socks[0], socks[1]

	w.setVerified(t, w.bizB.id, true)
	own.hear("user", w.bizB.id)

	// Everyone's market and trade lists change, so everyone hears those two.
	other.hear("listing", w.bizB.id)
	other.hear("transaction", w.bizB.id)

	w.setVerified(t, w.bizB.id, false)
	own.hear("user", w.bizB.id)

	count := func(body string) string {
		return tradeText(t, w.app, `SELECT count(*)::text FROM notifications
			WHERE user_id = $1 AND type = 'business_verified' AND body = $2`, w.bizB.id, body)
	}

	if count("Your business is verified. You can now see and edit every collector.") != "1" ||
		count("Your business verification was removed.") != "1" {
		t.Fatal("each change needs one notification")
	}

	if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications WHERE user_id = $1`, w.bizA.id); got != "0" {
		t.Fatalf("another business was notified: %s", got)
	}

	kinds := privacyKinds(t, w.admin, w.bizB.id)
	if len(kinds) != 2 || kinds[0] != "business_verify" {
		t.Fatalf("audit kinds: %v", kinds)
	}

	if actor := tradeText(t, w.app, `SELECT actor_id FROM privacy_events WHERE kind = 'business_verify' LIMIT 1`); actor != w.admin.id {
		t.Fatalf("actor %s", actor)
	}
}

func TestRoleChangeKeepsBusinessAndLastOwnerEraseClearsVerification(t *testing.T) {
	w := newVerifyWorld(t)
	w.setVerified(t, w.bizA.id, true)
	w.setVerified(t, w.bizB.id, true)

	stored := func(id string) string {
		return tradeText(t, w.app, `SELECT coalesce(business_verified_at::text, '') || coalesce(business_verified_by, '')
			FROM businesses WHERE id = $1`, id)
	}

	tradeWant(t, "role", w.admin.c.Do("PATCH", "/api/admin/users/"+w.bizA.id+"/role", map[string]any{"role": "collector"}), 200)
	if stored(w.bizA.id) == "" {
		t.Fatal("a person role change cleared business verification")
	}

	if stored(w.bizB.id) == "" {
		t.Fatal("verification was not stored")
	}

	tradeWant(t, "erase", w.admin.c.Do("DELETE", "/api/admin/users/"+w.bizB.id, nil), 200)
	if stored(w.bizB.id) != "" {
		t.Fatal("erase kept the verification")
	}

	if len(privacyKinds(t, w.admin, w.bizB.id)) < 2 {
		t.Fatal("audit rows were lost with the erase")
	}
}
