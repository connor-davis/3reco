package tests

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/tests/testutil"
)

// webGet reads one path from the running server. It asks for gzip by hand and
// does not unpack it, so the test sees the real headers.
func webGet(t *testing.T, app *testutil.App, path string) (*http.Response, string) {
	t.Helper()

	req, err := http.NewRequest("GET", app.URL+path, nil)
	if err != nil {
		t.Fatal(err)
	}

	req.Header.Set("Accept-Encoding", "gzip")

	client := &http.Client{Transport: &http.Transport{DisableCompression: true}}

	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)

	return res, string(body)
}

func TestServesWebApp(t *testing.T) {
	dist := t.TempDir()
	page := "<html><body>" + strings.Repeat("3rEco ", 400) + "</body></html>"
	script := strings.Repeat("console.log('3reco');\n", 400)

	if err := os.WriteFile(filepath.Join(dist, "index.html"), []byte(page), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := os.Mkdir(filepath.Join(dist, "assets"), 0o700); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dist, "assets", "app-abc123.js"), []byte(script), 0o600); err != nil {
		t.Fatal(err)
	}

	app := testutil.Server(t, func(c *config.Config) { c.WebDist = dist })

	// A hashed asset: long cache, right type, gzipped.
	res, _ := webGet(t, app, "/assets/app-abc123.js")
	if res.StatusCode != 200 || !strings.Contains(res.Header.Get("Cache-Control"), "immutable") ||
		!strings.Contains(res.Header.Get("Cache-Control"), "max-age=31536000") {
		t.Errorf("asset: %d, cache %q", res.StatusCode, res.Header.Get("Cache-Control"))
	}

	if !strings.Contains(res.Header.Get("Content-Type"), "javascript") {
		t.Errorf("asset type %q", res.Header.Get("Content-Type"))
	}

	if res.Header.Get("Content-Encoding") != "gzip" {
		t.Errorf("asset not gzipped: %q", res.Header.Get("Content-Encoding"))
	}

	// The root, and a page path the router owns, both give index.html, never cached.
	for _, path := range []string{"/", "/index.html", "/market/listing/abc", "/sign-in"} {
		res, _ = webGet(t, app, path)
		if res.StatusCode != 200 || res.Header.Get("Cache-Control") != "no-cache" ||
			!strings.HasPrefix(res.Header.Get("Content-Type"), "text/html") {
			t.Errorf("%s: %d, cache %q, type %q", path, res.StatusCode,
				res.Header.Get("Cache-Control"), res.Header.Get("Content-Type"))
		}
	}

	// A missing asset is a plain 404, not the page.
	res, body := webGet(t, app, "/assets/gone-123.js")
	if res.StatusCode != 404 || strings.Contains(body, "3rEco") {
		t.Errorf("missing asset: %d", res.StatusCode)
	}

	// A path with .. cannot leave the folder.
	res, body = webGet(t, app, "/assets/../../go.mod")
	if strings.Contains(body, "module ") {
		t.Errorf("path escaped the dist folder: %d", res.StatusCode)
	}

	// An unknown API route stays a JSON 404.
	res, body = webGet(t, app, "/api/nope")
	if res.StatusCode != 404 || !strings.Contains(res.Header.Get("Content-Type"), "application/json") ||
		strings.Contains(body, "3rEco") {
		t.Errorf("unknown api route: %d %q %q", res.StatusCode, res.Header.Get("Content-Type"), body)
	}

	// The real API still works next to the web app.
	res, _ = webGet(t, app, "/api/health")
	if res.StatusCode != 200 {
		t.Errorf("health: %d", res.StatusCode)
	}
}

func TestMissingWebFolderKeepsAPI(t *testing.T) {
	app := testutil.Server(t, func(c *config.Config) { c.WebDist = filepath.Join(t.TempDir(), "nope") })

	res, _ := webGet(t, app, "/api/health")
	if res.StatusCode != 200 {
		t.Errorf("health: %d", res.StatusCode)
	}

	res, _ = webGet(t, app, "/market")
	if res.StatusCode != 404 {
		t.Errorf("page without a web folder: %d", res.StatusCode)
	}
}
