// Package testutil is the shared setup for the Go tests: a fresh Postgres
// database per test, a running API on a random port, a cookie-keeping HTTP
// client and a reader for Mailpit.
package testutil

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"go.uber.org/fx"

	"github.com/connor-davis/3reco/internal/api"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/storage"
	"github.com/connor-davis/3reco/internal/services/invoices"
	"github.com/connor-davis/3reco/internal/services/privacy"
	"github.com/connor-davis/3reco/internal/services/transactions"
)

// FieldKey is the encryption key every test server uses.
const FieldKey = "M3JlY28tZGV2LWZpZWxkLWtleS0wMTIzNDU2Nzg5YWI="

// Seal encrypts a value the way the stores do, for tests that write the
// protected columns with raw SQL.
func Seal(t testing.TB, plain string) string {
	t.Helper()

	cipher, err := crypt.New(FieldKey)
	if err != nil {
		t.Fatalf("cipher: %v", err)
	}

	sealed, err := cipher.Encrypt(plain)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	return sealed
}

// Cipher is the test field cipher.
func Cipher(t testing.TB) *crypt.Cipher {
	t.Helper()

	cipher, err := crypt.New(FieldKey)
	if err != nil {
		t.Fatalf("cipher: %v", err)
	}

	return cipher
}

const defaultDB = "postgres://threereco:threereco@localhost:5441/threereco?sslmode=disable"

// MailpitURL is Mailpit's web and API address from `task up`.
var MailpitURL = config.Env("THREERECO_TEST_MAILPIT_URL", "http://localhost:8026")

// WebOrigin is the origin the test server treats as its web app.
const WebOrigin = "http://localhost:5173"

// skipOrFail ends a test whose service is down: a failure when
// THREERECO_REQUIRE_SERVICES=1, a skip otherwise.
func skipOrFail(t testing.TB, format string, args ...any) {
	t.Helper()

	if os.Getenv("THREERECO_REQUIRE_SERVICES") == "1" {
		t.Fatalf(format, args...)
	}

	t.Skipf(format, args...)
}

func baseURL() string { return config.Env("THREERECO_TEST_DATABASE_URL", defaultDB) }

// NewDB makes a fresh, migrated database for one test and drops it after.
func NewDB(t testing.TB) *database.DB {
	t.Helper()

	ctx := context.Background()

	admin, err := pgx.Connect(ctx, baseURL())
	if err != nil {
		skipOrFail(t, "postgres is not reachable (run `task up`): %v", err)
	}

	name := "t_" + database.NewID()

	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("create database: %v", err)
	}

	u, _ := url.Parse(baseURL())
	u.Path = "/" + name

	db, err := database.Connect(ctx, u.String(), 10)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}

	if err := database.Migrate(ctx, db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	t.Cleanup(func() {
		db.Close()

		_, _ = admin.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
		_ = admin.Close(ctx)
	})

	return db
}

// App is a running API for one test.
type App struct {
	Invoices *invoices.Service
	Trades   *transactions.Service
	Privacy  *privacy.Service
	Storage  *storage.Client
	DB       *database.DB
	Config   config.Config
	URL      string // http://127.0.0.1:<port>
	Host     string // 127.0.0.1:<port>
}

// Server starts the whole API on a random port against a fresh database.
// tweak may change the config before it starts.
func Server(t testing.TB, tweak ...func(*config.Config)) *App {
	t.Helper()

	app, err := TryServer(t, tweak...)
	if err != nil {
		t.Fatalf("start api: %v", err)
	}

	return app
}

// TryServer is Server, but hands back the start error instead of failing, for
// tests that expect the server to refuse to start.
func TryServer(t testing.TB, tweak ...func(*config.Config)) (*App, error) {
	t.Helper()

	// Request logs make a failing run hard to read; warnings and errors stay.
	slog.SetLogLoggerLevel(slog.LevelWarn)

	db := NewDB(t)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config: %v", err)
	}

	cfg.Addr = "127.0.0.1:0"
	cfg.WebOrigin = WebOrigin
	cfg.DatabaseURL = db.URL
	cfg.AuthRateLimit = 100000
	cfg.SMTPHost = "localhost"
	cfg.SMTPPort = 1026
	cfg.ResendAPIKey = ""
	cfg.Dev = true
	cfg.ShutdownTimeout = 2 * time.Second
	cfg.FieldKey = FieldKey

	for _, fn := range tweak {
		fn(&cfg)
	}

	objects := testStorage(t, &cfg)

	var listener *api.Listener
	var invoiceService *invoices.Service
	var transactionService *transactions.Service
	var privacyService *privacy.Service

	app := fx.New(
		fx.NopLogger,
		fx.Supply(cfg, db),
		api.Module,
		fx.Populate(&listener, &invoiceService, &transactionService, &privacyService),
	)

	if err := app.Err(); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := app.Start(ctx); err != nil {
		return nil, err
	}

	t.Cleanup(func() {
		stop, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		_ = app.Stop(stop)
	})

	return &App{
		DB: db, Storage: objects, Invoices: invoiceService, Trades: transactionService, Privacy: privacyService,
		Config: cfg, URL: "http://" + listener.Addr(), Host: listener.Addr(),
	}, nil
}

// Client is one browser: it keeps cookies between calls.
type Client struct {
	t    testing.TB
	app  *App
	HTTP *http.Client
}

// NewClient makes a browser for the app.
func (a *App) NewClient(t testing.TB) *Client {
	jar, _ := cookiejar.New(nil)

	return &Client{t: t, app: a, HTTP: &http.Client{Jar: jar, Timeout: 20 * time.Second}}
}

// Response is a status and a decoded JSON body.
type Response struct {
	Status int
	Body   map[string]any
	Raw    []byte
}

// Do sends one request the way the web app does (with its Origin) and decodes
// the JSON answer. body may be nil, or anything JSON can encode.
func (c *Client) Do(method, path string, body any) Response {
	c.t.Helper()

	var reader io.Reader

	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			c.t.Fatalf("encode body: %v", err)
		}

		reader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.app.URL+path, reader)
	if err != nil {
		c.t.Fatalf("request: %v", err)
	}

	req.Header.Set("Origin", WebOrigin)

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	out := Response{Status: resp.StatusCode, Raw: raw}
	_ = json.Unmarshal(raw, &out.Body)

	return out
}

// Cookie returns the value of a cookie the app set, or "".
func (c *Client) Cookie(name string) string {
	u, _ := url.Parse(c.app.URL)

	for _, cookie := range c.HTTP.Jar.Cookies(u) {
		if cookie.Name == name {
			return cookie.Value
		}
	}

	return ""
}

// SetCookie plants a cookie, as a browser that already held it would.
func (c *Client) SetCookie(name, value string) {
	u, _ := url.Parse(c.app.URL)

	c.HTTP.Jar.SetCookies(u, []*http.Cookie{{Name: name, Value: value, Path: "/"}})
}

// Mail is one message read back from Mailpit.
type Mail struct {
	Subject     string
	Text        string
	HTML        string
	Attachments []MailAttachment
}

// MailAttachment is the attachment metadata returned by Mailpit.
type MailAttachment struct {
	FileName    string
	ContentType string
	Size        int
}

var tokenRe = regexp.MustCompile(`[?&]token=([A-Za-z0-9_-]+)`)

// Token pulls the one-time token out of the link in the mail text.
func (m Mail) Token() string {
	found := tokenRe.FindStringSubmatch(m.Text)
	if found == nil {
		return ""
	}

	return found[1]
}

// WaitMail waits for a message to the address whose subject has the given
// words. Mailpit is shared, so tests use a fresh address each time.
func WaitMail(t testing.TB, to, subject string) Mail {
	t.Helper()

	deadline := time.Now().Add(15 * time.Second)

	for time.Now().Before(deadline) {
		if m, ok := findMail(t, to, subject); ok {
			return m
		}

		time.Sleep(150 * time.Millisecond)
	}

	t.Fatalf("no mail to %s with subject %q", to, subject)

	return Mail{}
}

func findMail(t testing.TB, to, subject string) (Mail, bool) {
	t.Helper()

	var list struct {
		Messages []struct {
			ID      string
			Subject string
		}
	}

	if !mailpit(t, "/api/v1/search?query="+url.QueryEscape("to:"+to), &list) {
		return Mail{}, false
	}

	for _, msg := range list.Messages {
		if !strings.Contains(msg.Subject, subject) {
			continue
		}

		var full struct {
			Text, HTML  string
			Attachments []MailAttachment
		}

		if mailpit(t, "/api/v1/message/"+msg.ID, &full) {
			return Mail{Subject: msg.Subject, Text: full.Text, HTML: full.HTML, Attachments: full.Attachments}, true
		}
	}

	return Mail{}, false
}

func mailpit(t testing.TB, path string, into any) bool {
	t.Helper()

	resp, err := http.Get(MailpitURL + path)
	if err != nil {
		skipOrFail(t, "mailpit is not reachable (run `task up`): %v", err)

		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false
	}

	return json.NewDecoder(resp.Body).Decode(into) == nil
}

// NoMail reports whether no message to the address has reached Mailpit.
func NoMail(t testing.TB, to string) bool {
	t.Helper()

	var list struct{ Count int }

	mailpit(t, "/api/v1/search?query="+url.QueryEscape("to:"+to), &list)

	return list.Count == 0
}

// Email returns an address no other test uses.
func Email(prefix string) string {
	return fmt.Sprintf("%s-%s@example.test", prefix, database.NewID()[:10])
}
