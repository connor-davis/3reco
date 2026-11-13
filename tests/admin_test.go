package tests

import (
	"strings"
	"testing"
)

func TestAdminUsersAccess(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	anon := w.app.NewClient(t)

	list := admin.c.Do("GET", "/api/admin/users", nil)
	tradeWant(t, "admin list", list, 200)

	// The seller, the buyer, the admin and the staff member are all live.
	if n := len(tradeItems(list)); n != 4 {
		t.Errorf("admin sees %d users, want 4: %s", n, list.Raw)
	}

	for _, secret := range []string{"password", "bank", "id_number", w.seller.phone} {
		if strings.Contains(string(list.Raw), secret) {
			t.Errorf("user list leaks %q", secret)
		}
	}

	for name, u := range map[string]tradeUser{"business": w.buyer, "staff": staff} {
		tradeWant(t, name+" list", u.c.Do("GET", "/api/admin/users", nil), 403)
		tradeWant(t, name+" remove", u.c.Do("DELETE", "/api/admin/users/"+w.seller.id, nil), 403)
		tradeWant(t, name+" role", u.c.Do("PATCH", "/api/admin/users/"+w.seller.id+"/role",
			map[string]any{"role": "admin"}), 403)
	}

	tradeWant(t, "anonymous list", anon.Do("GET", "/api/admin/users", nil), 401)
	tradeWant(t, "anonymous remove", anon.Do("DELETE", "/api/admin/users/"+w.seller.id, nil), 401)
	tradeWant(t, "anonymous role", anon.Do("PATCH", "/api/admin/users/"+w.seller.id+"/role",
		map[string]any{"role": "admin"}), 401)

	if got := tradeText(t, w.app, `SELECT role FROM users WHERE id = $1`, w.seller.id); got != "business" {
		t.Errorf("seller role %s after refused changes, want business", got)
	}
}

func TestAdminSetRole(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	path := "/api/admin/users/" + w.seller.id + "/role"

	tradeWant(t, "bad role", admin.c.Do("PATCH", path, map[string]any{"role": "king"}), 400)
	tradeWant(t, "missing user", admin.c.Do("PATCH", "/api/admin/users/nope/role",
		map[string]any{"role": "staff"}), 404)
	tradeWant(t, "own role", admin.c.Do("PATCH", "/api/admin/users/"+admin.id+"/role",
		map[string]any{"role": "staff"}), 403)
	tradeWant(t, "set staff", admin.c.Do("PATCH", path, map[string]any{"role": "staff"}), 200)

	if got := tradeText(t, w.app, `SELECT role FROM users WHERE id = $1`, w.seller.id); got != "staff" {
		t.Errorf("seller role %s, want staff", got)
	}
}

func TestAdminRemoveUser(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeNote(t, w, w.seller, "n1")

	tradeWant(t, "remove self", admin.c.Do("DELETE", "/api/admin/users/"+admin.id, nil), 403)
	tradeWant(t, "remove missing", admin.c.Do("DELETE", "/api/admin/users/nope", nil), 404)
	tradeWant(t, "remove", admin.c.Do("DELETE", "/api/admin/users/"+w.seller.id, nil), 200)
	tradeWant(t, "remove twice", admin.c.Do("DELETE", "/api/admin/users/"+w.seller.id, nil), 404)

	// Their session is dead and everything private is gone.
	tradeWant(t, "old session", w.seller.c.Do("GET", "/api/notifications", nil), 401)

	for _, sql := range []string{
		`SELECT count(*)::text FROM notifications WHERE user_id = $1`,
		`SELECT count(*)::text FROM sessions WHERE user_id = $1`,
		`SELECT count(*)::text FROM transaction_requests WHERE seller_id = $1 AND status <> 'cancelled'`,
	} {
		if n := tradeText(t, w.app, sql, w.seller.id); n != "0" {
			t.Errorf("%s: %s rows left, want 0", sql, n)
		}
	}

	if got := tradeText(t, w.app, `SELECT count(*)::text FROM stock WHERE owner_id=$1`, w.seller.id); got != "1" {
		t.Fatal("removing a person deleted business stock")
	}

	if tradeText(t, w.app, `SELECT email FROM users WHERE id = $1`, w.seller.id) != "" {
		t.Errorf("removed user kept their email")
	}

	// The buyer's open request is cancelled, not deleted, so they see what happened.
	old := w.buyer.c.Do("GET", "/api/requests/"+id, nil)
	tradeWant(t, "buyer's old request", old, 200)

	if old.Body["status"] != "cancelled" {
		t.Errorf("buyer's old request status %v, want cancelled", old.Body["status"])
	}

	// They are gone from the list, and cannot sign in again.
	if raw := string(admin.c.Do("GET", "/api/admin/users", nil).Raw); strings.Contains(raw, w.seller.id) {
		t.Errorf("removed user still listed")
	}

	if res := signIn(t, w.app.NewClient(t), w.seller.email, goodPassword); res.Status < 400 {
		t.Errorf("removed user signed in: %d", res.Status)
	}
}

// Hole 23: a trade with a removed user still shows, but not who they were.
func TestRemovedUserTransactionLeak(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	tx := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")

	tradeWant(t, "remove buyer", admin.c.Do("DELETE", "/api/admin/users/"+w.buyer.id, nil), 200)

	detail := w.seller.c.Do("GET", "/api/transactions/"+tx, nil)
	tradeWant(t, "seller detail", detail, 200)

	raw := string(detail.Raw)
	if !strings.Contains(raw, "Removed account") {
		t.Errorf("detail does not say the buyer was removed: %s", raw)
	}

	for _, secret := range []string{w.buyer.email, w.buyer.phone, "Biz " + w.buyer.id[:6]} {
		if strings.Contains(raw, secret) {
			t.Errorf("detail still shows %q", secret)
		}
	}

	if n := len(tradeItems(w.seller.c.Do("GET", "/api/transactions/sales", nil))); n != 1 {
		t.Errorf("seller sales %d after the buyer was removed, want 1", n)
	}

	// The removed buyer's session cannot read the trade any more.
	tradeWant(t, "removed buyer detail", w.buyer.c.Do("GET", "/api/transactions/"+tx, nil), 401)
}

func TestDashboardCarbonKeepsDecimals(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	stranger := tradeNewUser(t, w.app, "business")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000088")

	// 10 kg at 0.25 is 2.5 kg of CO2e; whole-kg rounding would show 3.
	tradeExec(t, w.app, `UPDATE materials SET carbon_factor = 0.25 WHERE id = $1`, w.material)
	tradeOldSale(t, w.app, collector, w.buyer, w.material, "2026-03-01T10:00:00Z", nil, nil)

	path := "/api/admin/dashboard?from=2026-03-01&to=2026-03-02"
	totals, _ := tradeDash(t, admin, path)["totals"].(map[string]any)
	if totals["carbon_savings"] != "2.5" {
		t.Errorf("admin carbon %v, want 2.5", totals["carbon_savings"])
	}

	// Someone else's trade stays out of a stranger's totals.
	other, _ := tradeDash(t, stranger, "/api/dashboard/business?from=2026-03-01&to=2026-03-02")["totals"].(map[string]any)
	if other["carbon_savings"] != "0" {
		t.Errorf("stranger carbon %v, want 0", other["carbon_savings"])
	}
}
