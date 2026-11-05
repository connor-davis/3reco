package tests

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/tests/testutil"
)

const goodPassword = "a long enough password"

// signUp registers an address and returns it. verify marks the email as
// checked straight in the database, to keep most tests fast.
func signUp(t *testing.T, app *testutil.App, c *testutil.Client, verify bool) string {
	t.Helper()

	email := testutil.Email("user")

	res := c.Do("POST", "/api/auth/sign-up", map[string]any{
		"name": "Test User", "email": email, "password": goodPassword,
	})
	if res.Status != http.StatusOK {
		t.Fatalf("sign-up: %d %s", res.Status, res.Raw)
	}

	if verify {
		_, err := app.DB.Pool.Exec(context.Background(),
			`UPDATE users SET email_verified = true WHERE email = $1`, email)
		if err != nil {
			t.Fatal(err)
		}
	}

	return email
}

func signIn(t *testing.T, c *testutil.Client, email, password string) testutil.Response {
	t.Helper()

	return c.Do("POST", "/api/auth/sign-in", map[string]any{"email": email, "password": password})
}

func TestHealth(t *testing.T) {
	app := testutil.Server(t)

	res := app.NewClient(t).Do("GET", "/api/health", nil)
	if res.Status != 200 || res.Body["status"] != "ok" {
		t.Fatalf("health: %d %s", res.Status, res.Raw)
	}

	if res := app.NewClient(t).Do("GET", "/api/nope", nil); res.Status != 404 {
		t.Fatalf("unknown path: %d, want a JSON 404", res.Status)
	}
}

func TestSignUpVerifyAndSignIn(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)

	short := c.Do("POST", "/api/auth/sign-up", map[string]any{
		"name": "A", "email": testutil.Email("short"), "password": "short",
	})
	if short.Status != 400 {
		t.Fatalf("short password: %d, want 400", short.Status)
	}

	email := signUp(t, app, c, false)

	// An unverified email cannot sign in, and the answer says why.
	res := signIn(t, c, email, goodPassword)
	if res.Status != 403 || res.Body["code"] != "email_not_verified" {
		t.Fatalf("unverified sign-in: %d %s", res.Status, res.Raw)
	}

	mail := testutil.WaitMail(t, email, "Verify your 3rEco email address")
	if !strings.Contains(mail.Text, "Click below to verify your email address and finish setting up your 3rEco account.") {
		t.Errorf("verification mail has the wrong words: %s", mail.Text)
	}

	token := mail.Token()
	if token == "" {
		t.Fatalf("no token in mail: %s", mail.Text)
	}

	if res := c.Do("POST", "/api/auth/verify-email", map[string]any{"token": "nonsense"}); res.Status != 400 {
		t.Errorf("bad token: %d, want 400", res.Status)
	}

	if res := c.Do("POST", "/api/auth/verify-email", map[string]any{"token": token}); res.Status != 200 {
		t.Fatalf("verify: %d %s", res.Status, res.Raw)
	}

	// The link works once.
	if res := c.Do("POST", "/api/auth/verify-email", map[string]any{"token": token}); res.Status != 400 {
		t.Errorf("reused token: %d, want 400", res.Status)
	}

	if res := signIn(t, c, email, "wrong password!"); res.Status != 401 {
		t.Errorf("wrong password: %d, want 401", res.Status)
	}

	if res := signIn(t, c, email, goodPassword); res.Status != 200 {
		t.Fatalf("sign-in: %d %s", res.Status, res.Raw)
	}

	me := c.Do("GET", "/api/auth/me", nil)
	user, _ := me.Body["user"].(map[string]any)

	if me.Status != 200 || user["email"] != email {
		t.Fatalf("me: %d %s", me.Status, me.Raw)
	}

	if _, has := user["role"]; !has {
		t.Error("me has no role key")
	}

	if strings.Contains(string(me.Raw), "argon2") || strings.Contains(string(me.Raw), "password") {
		t.Errorf("me leaks the password hash: %s", me.Raw)
	}

	if res := c.Do("POST", "/api/auth/sign-out", nil); res.Status != 200 {
		t.Fatalf("sign-out: %d", res.Status)
	}

	if res := c.Do("GET", "/api/auth/me", nil); res.Status != 401 {
		t.Errorf("me after sign-out: %d, want 401", res.Status)
	}
}

func TestSignUpHidesExistingEmail(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)
	email := signUp(t, app, c, true)

	// The same address again looks like a new sign-up, so the form cannot be
	// used to find who has an account.
	res := c.Do("POST", "/api/auth/sign-up", map[string]any{
		"name": "Other", "email": strings.ToUpper(email), "password": "another password",
	})
	if res.Status != 200 {
		t.Fatalf("duplicate sign-up: %d %s", res.Status, res.Raw)
	}

	// The first password still works; the second sign-up did not take over the account.
	if res := signIn(t, c, email, goodPassword); res.Status != 200 {
		t.Fatalf("original password: %d", res.Status)
	}

	if res := c.Do("POST", "/api/auth/forgot-password", map[string]any{"email": testutil.Email("none")}); res.Status != 200 {
		t.Errorf("forgot for an unknown email: %d, want 200", res.Status)
	}
}

func TestPasswordReset(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)
	email := signUp(t, app, c, true)

	signIn(t, c, email, goodPassword)

	if res := c.Do("POST", "/api/auth/forgot-password", map[string]any{"email": email}); res.Status != 200 {
		t.Fatalf("forgot: %d", res.Status)
	}

	mail := testutil.WaitMail(t, email, "Reset your 3rEco password")
	token := mail.Token()

	if token == "" {
		t.Fatalf("no token in mail: %s", mail.Text)
	}

	if res := c.Do("POST", "/api/auth/reset-password", map[string]any{
		"token": token, "password": "short",
	}); res.Status != 400 {
		t.Fatalf("short new password: %d, want 400", res.Status)
	}

	// The failed try above did not use up the link.
	if res := c.Do("POST", "/api/auth/reset-password", map[string]any{
		"token": token, "password": "a brand new password",
	}); res.Status != 200 {
		t.Fatalf("reset: %d %s", res.Status, res.Raw)
	}

	if res := c.Do("POST", "/api/auth/reset-password", map[string]any{
		"token": token, "password": "yet another password",
	}); res.Status != 400 {
		t.Errorf("reused reset link: %d, want 400", res.Status)
	}

	// A reset signs every browser out.
	if res := c.Do("GET", "/api/auth/me", nil); res.Status != 401 {
		t.Errorf("old session after reset: %d, want 401", res.Status)
	}

	if res := signIn(t, c, email, goodPassword); res.Status != 401 {
		t.Errorf("old password after reset: %d, want 401", res.Status)
	}

	if res := signIn(t, c, email, "a brand new password"); res.Status != 200 {
		t.Errorf("new password: %d, want 200", res.Status)
	}
}

func TestLegacyScryptLoginIsRehashed(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)
	v := legacyVectors[1]
	email := testutil.Email("legacy")

	_, err := app.DB.Pool.Exec(context.Background(), `
		INSERT INTO users (id, email, email_verified, password_hash, name)
		VALUES ('legacyuser', $1, true, $2, 'Legacy')`, email, v.hash)
	if err != nil {
		t.Fatal(err)
	}

	if res := signIn(t, c, email, "not the password"); res.Status != 401 {
		t.Fatalf("wrong password on a legacy hash: %d", res.Status)
	}

	if res := signIn(t, c, email, v.password); res.Status != 200 {
		t.Fatalf("legacy sign-in: %d %s", res.Status, res.Raw)
	}

	var stored string

	err = app.DB.Pool.QueryRow(context.Background(),
		`SELECT password_hash FROM users WHERE id = 'legacyuser'`).Scan(&stored)
	if err != nil {
		t.Fatal(err)
	}

	if !strings.HasPrefix(stored, "$argon2id$") {
		t.Fatalf("hash was not upgraded: %.20s", stored)
	}

	// And the upgraded hash still lets the same password in.
	if res := signIn(t, app.NewClient(t), email, v.password); res.Status != 200 {
		t.Errorf("sign-in after rehash: %d", res.Status)
	}
}

func TestSeveralAccountsInOneBrowser(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)
	one := signUp(t, app, c, true)
	two := signUp(t, app, c, true)

	signIn(t, c, one, goodPassword)
	signIn(t, c, two, goodPassword)

	list := func() []any {
		res := c.Do("GET", "/api/auth/sessions", nil)
		out, _ := res.Body["sessions"].([]any)

		return out
	}

	meEmail := func() string {
		user, _ := c.Do("GET", "/api/auth/me", nil).Body["user"].(map[string]any)
		email, _ := user["email"].(string)

		return email
	}

	sessions := list()
	if len(sessions) != 2 || meEmail() != two {
		t.Fatalf("after two sign-ins: %d sessions, active %s", len(sessions), meEmail())
	}

	var firstID string

	for _, s := range sessions {
		m := s.(map[string]any)
		if m["email"] == one {
			firstID = m["id"].(string)
		}
	}

	if res := c.Do("POST", "/api/auth/sessions/"+firstID+"/switch", nil); res.Status != 200 {
		t.Fatalf("switch: %d %s", res.Status, res.Raw)
	}

	if meEmail() != one {
		t.Fatalf("after switch the active account is %s, want %s", meEmail(), one)
	}

	if res := c.Do("POST", "/api/auth/sessions/revoke-others", nil); res.Status != 200 {
		t.Fatalf("revoke others: %d", res.Status)
	}

	if got := list(); len(got) != 1 || meEmail() != one {
		t.Fatalf("after revoke-others: %d sessions, active %s", len(got), meEmail())
	}

	if res := c.Do("POST", "/api/auth/sessions/sign-out-all", nil); res.Status != 200 {
		t.Fatalf("sign out all: %d", res.Status)
	}

	if res := c.Do("GET", "/api/auth/me", nil); res.Status != 401 {
		t.Errorf("me after sign-out-all: %d, want 401", res.Status)
	}
}

// TestSessionsDoNotLeak: user A tries to read, switch to and revoke user B's session.
func TestSessionsDoNotLeak(t *testing.T) {
	app := testutil.Server(t)
	a, b := app.NewClient(t), app.NewClient(t)
	emailA, emailB := signUp(t, app, a, true), signUp(t, app, b, true)

	signIn(t, a, emailA, goodPassword)
	signIn(t, b, emailB, goodPassword)

	mine, _ := b.Do("GET", "/api/auth/sessions", nil).Body["sessions"].([]any)
	if len(mine) != 1 {
		t.Fatalf("B sees %d sessions, want 1", len(mine))
	}

	bID := mine[0].(map[string]any)["id"].(string)

	seen := a.Do("GET", "/api/auth/sessions", nil)
	if strings.Contains(string(seen.Raw), bID) || strings.Contains(string(seen.Raw), emailB) {
		t.Fatalf("A's session list shows B: %s", seen.Raw)
	}

	if res := a.Do("DELETE", "/api/auth/sessions/"+bID, nil); res.Status != 404 {
		t.Errorf("A revokes B: %d, want 404", res.Status)
	}

	if res := a.Do("POST", "/api/auth/sessions/"+bID+"/switch", nil); res.Status != 404 {
		t.Errorf("A switches to B: %d, want 404", res.Status)
	}

	if res := a.Do("POST", "/api/auth/sessions/revoke-others", nil); res.Status != 200 {
		t.Errorf("A revokes others: %d", res.Status)
	}

	// B is untouched, and A is still A.
	if res := b.Do("GET", "/api/auth/me", nil); res.Status != 200 {
		t.Errorf("B after A's tries: %d, want 200", res.Status)
	}

	user, _ := a.Do("GET", "/api/auth/me", nil).Body["user"].(map[string]any)
	if user["email"] != emailA {
		t.Errorf("A is now %v", user["email"])
	}
}

func TestSignedOutAndCrossSiteRequests(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)

	if res := c.Do("GET", "/api/auth/me", nil); res.Status != 401 {
		t.Errorf("me without a cookie: %d, want 401", res.Status)
	}

	if res := c.Do("GET", "/api/auth/sessions", nil); res.Status != 401 {
		t.Errorf("sessions without a cookie: %d, want 401", res.Status)
	}

	// A write that a browser sends from another site is refused before any work.
	req, _ := http.NewRequest("POST", app.URL+"/api/auth/sign-out", nil)
	req.Header.Set("Origin", "https://evil.example")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}

	resp.Body.Close()

	if resp.StatusCode != 403 {
		t.Errorf("cross-site POST: %d, want 403", resp.StatusCode)
	}
}

func TestAuthRateLimit(t *testing.T) {
	app := testutil.Server(t, func(cfg *config.Config) { cfg.AuthRateLimit = 3 })
	c := app.NewClient(t)

	var last int

	for range 6 {
		last = signIn(t, c, "nobody@example.test", "whatever it is").Status
	}

	if last != 429 {
		t.Errorf("sixth sign-in in a minute: %d, want 429", last)
	}
}
