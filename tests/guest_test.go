package tests

import (
	"context"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// newGuest signs someone up and in, and leaves them a guest.
func newGuest(t *testing.T, app *testutil.App) (*testutil.Client, string) {
	t.Helper()

	c := app.NewClient(t)
	email := signUp(t, app, c, true)
	status(t, signIn(t, c, email, goodPassword), 200)

	return c, userID(t, c)
}

func TestSignUpCreatesGuest(t *testing.T) {
	app := testutil.Server(t)
	_, id := newGuest(t, app)

	if got := tradeText(t, app, `SELECT role FROM users WHERE id = $1`, id); got != "guest" {
		t.Fatalf("new account role %q, want guest", got)
	}

	_, err := app.DB.Pool.Exec(context.Background(), `UPDATE users SET role = 'king' WHERE id = $1`, id)
	if err == nil {
		t.Fatal("the database accepted an unknown role")
	}

	if _, err := app.DB.Pool.Exec(context.Background(), `UPDATE users SET role = NULL WHERE id = $1`, id); err == nil {
		t.Fatal("the database accepted a missing role")
	}
}

func TestGuestIsBlockedUntilSetup(t *testing.T) {
	app := testutil.Server(t)
	guest, id := newGuest(t, app)
	other := tradeNewUser(t, app, "business")

	blocked := []struct{ method, path string }{
		{"GET", "/api/stock"}, {"POST", "/api/stock"}, {"GET", "/api/cart"},
		{"GET", "/api/requests"}, {"GET", "/api/transactions"}, {"GET", "/api/collectors"},
		{"GET", "/api/notifications"}, {"GET", "/api/reviews/reviewable"},
		{"GET", "/api/market/listings"}, {"GET", "/api/stores"}, {"GET", "/api/materials"},
		{"GET", "/api/stats"}, {"GET", "/api/messages/inbox"}, {"GET", "/api/admin/users"},
		{"GET", "/api/admin/dashboard"}, {"GET", "/api/users/" + other.id},
		{"GET", "/api/users/" + other.id + "/avatar"},
	}

	for _, item := range blocked {
		res := guest.Do(item.method, item.path, nil)
		if res.Status != 403 {
			t.Errorf("guest %s %s = %d, want 403: %s", item.method, item.path, res.Status, res.Raw)
		}
	}

	// Their own account stays open.
	status(t, guest.Do("GET", "/api/auth/me", nil), 200)
	status(t, guest.Do("GET", "/api/profile", nil), 200)

	// The live socket stays open so a role change reaches them; a plain GET is told to upgrade.
	status(t, guest.Do("GET", "/api/live", nil), 426)
	status(t, guest.Do("GET", "/api/profile/optional", nil), 200)
	status(t, guest.Do("PATCH", "/api/profile", map[string]any{"first_name": "Zanele"}), 200)
	status(t, guest.Do("GET", "/api/privacy/notice/current", nil), 200)
	status(t, guest.Do("POST", "/api/auth/sign-out", nil), 200)

	// Signed-out visitors keep browsing the public market.
	anon := app.NewClient(t)
	status(t, anon.Do("GET", "/api/market/listings", nil), 200)
	status(t, anon.Do("GET", "/api/stores", nil), 200)

	// A guest cannot mark their own profile done.
	again := app.NewClient(t)
	status(t, signIn(t, again, tradeText(t, app, `SELECT email FROM users WHERE id = $1`, id), goodPassword), 200)
	status(t, again.Do("PATCH", "/api/profile", map[string]any{"profile_complete": true}), 400)
}

// fillProfile saves everything setup asks for, as the setup pages do.
func fillProfile(t *testing.T, c *testutil.Client, business bool) {
	t.Helper()

	person := map[string]any{
		"name": "Zanele Dlamini", "first_name": "Zanele", "last_name": "Dlamini", "phone": "0821234567",
	}
	details := map[string]any{
		"street_address": "1 Main Road", "city": "Pretoria", "province": "Gauteng", "area_code": 1234,
		"bank_account_holder_name": "Z Dlamini", "bank_name": "FNB", "bank_account_number": "62123456789",
		"bank_branch_code": "250655", "bank_account_type": "Savings",
	}

	// A business keeps its name, bank and place on the Business API; a collector
	// keeps them on the profile.
	if !business {
		status(t, c.Do("PATCH", "/api/profile", merge(person, details)), 200)

		return
	}

	status(t, c.Do("PATCH", "/api/profile", person), 200)
	details["business_name"] = "Zanele Recycling"
	details["business_registration_number"] = "2020/123456/07"
	status(t, c.Do("PATCH", "/api/business", details), 200)
}

func TestSetupChoosesRoleOnce(t *testing.T) {
	app := testutil.Server(t)

	for _, role := range []string{"collector", "business"} {
		guest, id := newGuest(t, app)

		// Nothing is filled in yet.
		status(t, guest.Do("POST", "/api/profile/setup", map[string]any{"role": role}), 400)

		// Staff and admin can never be picked.
		for _, bad := range []string{"admin", "staff", "king", ""} {
			status(t, guest.Do("POST", "/api/profile/setup", map[string]any{"role": bad}), 400)
		}

		if role == "business" {
			fillProfile(t, guest, false)
			status(t, guest.Do("POST", "/api/profile/setup", map[string]any{"role": role}), 400)
		}

		fillProfile(t, guest, role == "business")
		status(t, guest.Do("POST", "/api/profile/setup", map[string]any{"role": role}), 200)

		got := tradeText(t, app, `SELECT role || profile_complete::text FROM users WHERE id = $1`, id)
		if got != role+"true" {
			t.Fatalf("after setup %q, want %s and complete", got, role)
		}

		// The app is open now, and the role cannot be picked again.
		status(t, guest.Do("GET", "/api/stock", nil), 200)
		status(t, guest.Do("POST", "/api/profile/setup", map[string]any{"role": "business"}), 409)
	}
}

func TestSetupNeverPromotesAnAdmin(t *testing.T) {
	app := testutil.Server(t)
	admin := tradeNewUser(t, app, "admin")

	status(t, admin.c.Do("POST", "/api/profile/setup", map[string]any{"role": "collector"}), 409)
	status(t, admin.c.Do("POST", "/api/profile/setup", map[string]any{}), 409)

	if got := tradeText(t, app, `SELECT role FROM users WHERE id = $1`, admin.id); got != "admin" {
		t.Fatalf("admin became %s", got)
	}
}

func TestSetupFinishesAnOlderIncompleteProfile(t *testing.T) {
	app := testutil.Server(t)
	user := tradeNewUser(t, app, "collector")
	tradeExec(t, app, `UPDATE users SET profile_complete = false, street_address = NULL WHERE id = $1`, user.id)

	// A role cannot be chosen again, and the missing street still blocks it.
	status(t, user.c.Do("POST", "/api/profile/setup", map[string]any{"role": "business"}), 409)
	status(t, user.c.Do("POST", "/api/profile/setup", map[string]any{}), 400)

	fillProfile(t, user.c, false)
	status(t, user.c.Do("POST", "/api/profile/setup", map[string]any{}), 200)
}

func TestAdminCanSendSomeoneBackToSetup(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	path := "/api/admin/users/" + w.seller.id + "/role"

	tradeWant(t, "guest", admin.c.Do("PATCH", path, map[string]any{"role": "guest"}), 200)
	tradeWant(t, "blocked", w.seller.c.Do("GET", "/api/stock", nil), 403)
}
