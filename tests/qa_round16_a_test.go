package tests

import (
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// A browser with a session cookie but no devices cookie (the QA browsers, or
// a dropped cookie) must keep the first account when a second signs in.
func TestAddAccountWithoutDevicesCookie(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)
	one := signUp(t, app, c, true)
	two := signUp(t, app, c, true)

	signIn(t, c, one, goodPassword)
	c.DropCookie("threereco_devices")

	if c.Cookie("threereco_session") == "" || c.Cookie("threereco_devices") != "" {
		t.Fatal("setup: want a session cookie and no devices cookie")
	}

	signIn(t, c, two, goodPassword)

	for _, token := range strings.Split(c.Cookie("threereco_devices"), ",") {
		if token == "" {
			t.Fatal("the devices cookie holds an empty token")
		}
	}

	res := c.Do("GET", "/api/auth/sessions", nil)
	sessions, _ := res.Body["sessions"].([]any)

	var firstID string

	for _, s := range sessions {
		m := s.(map[string]any)
		if m["email"] == one {
			firstID = m["id"].(string)
		}
	}

	if len(sessions) != 2 || firstID == "" {
		t.Fatalf("want both accounts listed, got %s", res.Raw)
	}

	if sw := c.Do("POST", "/api/auth/sessions/"+firstID+"/switch", nil); sw.Status != 200 {
		t.Fatalf("switch: %d %s", sw.Status, sw.Raw)
	}

	user, _ := c.Do("GET", "/api/auth/me", nil).Body["user"].(map[string]any)
	if user["email"] != one {
		t.Fatalf("after switch the active account is %v, want %s", user["email"], one)
	}
}

// Material price cap: the message groups the thousands.
func TestMaterialPriceCapMessage(t *testing.T) {
	app := testutil.Server(t)
	admin, _ := domainUser(t, app, "admin")
	body := map[string]any{"name": "Zinc", "gw_code": "GW16", "price": "100000.01", "carbon_factor": "1.5"}

	res := status(t, admin.Do("POST", "/api/admin/materials", body), 400)

	fields, _ := res.Body["fields"].(map[string]any)
	if fields["price"] != "Price must be R 100 000.00 per kg or less." {
		t.Fatalf("cap message: %s", res.Raw)
	}
}
