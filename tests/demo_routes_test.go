package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/tests/testutil"
)

func demoServer(t *testing.T, tweak ...func(*config.Config)) *testutil.App {
	t.Helper()

	return testutil.Server(t, append([]func(*config.Config){
		func(c *config.Config) { c.Demo = true },
	}, tweak...)...)
}

func TestConfigRouteSaysIfDemo(t *testing.T) {
	demo := demoServer(t)

	res := demo.NewClient(t).Do("GET", "/api/config", nil)
	if res.Status != 200 || res.Body["demo"] != true {
		t.Fatalf("demo config: %d %s", res.Status, res.Raw)
	}

	// Nothing but the flag is shared.
	if len(res.Body) != 1 {
		t.Errorf("config shares more than the flag: %s", res.Raw)
	}

	live := testutil.Server(t)

	res = live.NewClient(t).Do("GET", "/api/config", nil)
	if res.Status != 200 || res.Body["demo"] != false {
		t.Fatalf("live config: %d %s", res.Status, res.Raw)
	}

	// A signed-in guest (no role yet) may read it too.
	guest := live.NewClient(t)
	signIn(t, guest, signUp(t, live, guest, true), goodPassword)

	if res := guest.Do("GET", "/api/config", nil); res.Status != 200 {
		t.Errorf("guest config: %d %s", res.Status, res.Raw)
	}
}

func TestDemoBlocksSignUpExportsAndDelete(t *testing.T) {
	demo := demoServer(t)
	c := demo.NewClient(t)

	blocked := []struct{ method, path string }{
		{"POST", "/api/auth/sign-up"},
		{"POST", "/api/auth/forgot-password"},
		{"GET", "/api/exports/sales"},
		{"GET", "/api/exports/purchases"},
		{"GET", "/api/exports/collections"},
		{"GET", "/api/admin/exports/users"},
		{"GET", "/api/admin/exports/transactions"},
		{"GET", "/api/business/export"},
		{"GET", "/api/privacy/export"},
		{"POST", "/api/privacy/delete"},
		{"POST", "/api/team/invites"},
		{"POST", "/api/team/invites/abc/resend"},
		{"DELETE", "/api/team/invites/abc"},
		{"GET", "/api/auth/invites/sometoken"},
		{"POST", "/api/auth/invites/accept"},
		{"GET", "/api/admin/users"},
		{"POST", "/api/admin/materials"},
		{"DELETE", "/api/admin/reviews/abc"},
		{"GET", "/api/admin/privacy-events"},
		{"GET", "/api/admin/reports"},
	}

	for _, route := range blocked {
		res := c.Do(route.method, route.path, map[string]any{})
		if res.Status != 403 || res.Body["code"] != "demo_blocked" {
			t.Errorf("%s %s in demo: %d %s", route.method, route.path, res.Status, res.Raw)
		}

		if msg, _ := res.Body["message"].(string); msg == "" {
			t.Errorf("%s %s has no plain message", route.method, route.path)
		}
	}

	// Off the demo the same routes answer as before: not signed in, not blocked.
	live := testutil.Server(t)

	for _, route := range blocked[2:] {
		res := live.NewClient(t).Do(route.method, route.path, map[string]any{})
		if res.Body["code"] == "demo_blocked" {
			t.Errorf("%s %s is blocked outside the demo", route.method, route.path)
		}
	}

	signUp(t, live, live.NewClient(t), false)
}

func TestDemoKeepsSearchEnginesOut(t *testing.T) {
	dist := t.TempDir()
	page := "<html><head><title>3rEco</title></head><body>app</body></html>"

	if err := os.WriteFile(filepath.Join(dist, "index.html"), []byte(page), 0o600); err != nil {
		t.Fatal(err)
	}

	demo := demoServer(t, func(c *config.Config) { c.WebDist = dist })

	res, body := webGet(t, demo, "/some/page")
	if got := res.Header.Get("X-Robots-Tag"); !strings.Contains(got, "noindex") {
		t.Errorf("X-Robots-Tag = %q", got)
	}

	if !strings.Contains(body, `name="robots" content="noindex`) {
		t.Errorf("the page has no noindex tag: %s", body)
	}

	res, body = webGet(t, demo, "/robots.txt")
	if res.StatusCode != 200 || !strings.Contains(body, "Disallow: /") {
		t.Errorf("robots.txt: %d %q", res.StatusCode, body)
	}

	if res := demo.NewClient(t).Do("GET", "/api/config", nil); res.Status != 200 {
		t.Errorf("config: %d", res.Status)
	}

	live := testutil.Server(t, func(c *config.Config) { c.WebDist = dist })

	res, body = webGet(t, live, "/some/page")
	if res.Header.Get("X-Robots-Tag") != "" || strings.Contains(body, "noindex") {
		t.Errorf("a normal server hides from search engines: %q", res.Header.Get("X-Robots-Tag"))
	}
}

func TestDemoPhoneAlertsStayOff(t *testing.T) {
	demo := demoServer(t, func(c *config.Config) {
		c.VAPIDPublicKey = "public"
		c.VAPIDPrivateKey = "private"
	})

	if demo.Push.Enabled() {
		t.Error("phone alerts are on in the demo")
	}
}
