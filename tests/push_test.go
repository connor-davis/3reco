package tests

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/connor-davis/3reco/internal/platform/config"
	store "github.com/connor-davis/3reco/internal/stores/push"
	"github.com/connor-davis/3reco/tests/testutil"
)

// Dev-only VAPID pair; the same one the Taskfile uses.
const (
	testVAPIDPublic  = "BEKSVM-9TlLTb7_vrOekPXRt6-4zqsFEF-2nr3INu-PGhH9MCMOb99aC44213gmpZx1s8ESsO4m5t8RnG8pLZRg"
	testVAPIDPrivate = "fE2rpOHwxvyMj7vPEwgGf0nQNnu4HeIQBWwpnFb4f24"
)

// fakePush records what would be sent, and answers per endpoint.
type fakePush struct {
	mu     sync.Mutex
	status map[string]int
	fail   map[string]bool
	sent   chan sentPush
}

type sentPush struct {
	endpoint string
	payload  map[string]any
}

func newFakePush() *fakePush {
	return &fakePush{status: map[string]int{}, fail: map[string]bool{}, sent: make(chan sentPush, 50)}
}

func (f *fakePush) Send(_ context.Context, sub store.Subscription, body []byte) (int, error) {
	var payload map[string]any
	_ = json.Unmarshal(body, &payload)
	f.sent <- sentPush{sub.Endpoint, payload}

	f.mu.Lock()
	defer f.mu.Unlock()

	if f.fail[sub.Endpoint] {
		return 0, errors.New("push service down")
	}

	if code := f.status[sub.Endpoint]; code != 0 {
		return code, nil
	}

	return 201, nil
}

func (f *fakePush) next(t *testing.T) sentPush {
	t.Helper()

	select {
	case s := <-f.sent:
		return s
	case <-time.After(10 * time.Second):
		t.Fatal("no push was sent")
	}

	return sentPush{}
}

func (f *fakePush) quiet(t *testing.T) {
	t.Helper()

	select {
	case s := <-f.sent:
		t.Fatalf("unexpected push to %s", s.endpoint)
	case <-time.After(500 * time.Millisecond):
	}
}

func pushApp(t *testing.T) (*testutil.App, *fakePush) {
	t.Helper()

	app := testutil.Server(t, func(c *config.Config) {
		c.VAPIDPublicKey = testVAPIDPublic
		c.VAPIDPrivateKey = testVAPIDPrivate
	})
	fake := newFakePush()
	app.Push.SetSender(fake)

	return app, fake
}

func pushBody(endpoint string) map[string]any {
	return map[string]any{
		"endpoint": endpoint,
		"keys":     map[string]string{"p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA", "auth": "tBHItJI5svbpez7KI4CCXg"},
	}
}

func pushEndpoints(t *testing.T, app *testutil.App, userID string) string {
	t.Helper()

	return tradeText(t, app, `SELECT COALESCE(string_agg(endpoint, ',' ORDER BY endpoint), '')
		FROM push_subscriptions WHERE user_id=$1`, userID)
}

func pushNote(t *testing.T, app *testutil.App, id, userID, link string) {
	t.Helper()

	tradeExec(t, app, `INSERT INTO notifications (id, user_id, type, title, body, link)
		VALUES ($1, $2, 'message_received', 'New message', 'Hi there', NULLIF($3, ''))`,
		id, userID, link)
}

func TestPushRoutesNeedSignIn(t *testing.T) {
	app, _ := pushApp(t)
	anon := app.NewClient(t)

	tradeWant(t, "key", anon.Do("GET", "/api/push/key", nil), 401)
	tradeWant(t, "subscribe", anon.Do("POST", "/api/push/subscriptions", pushBody("https://push.example/a")), 401)
	tradeWant(t, "unsubscribe", anon.Do("POST", "/api/push/unsubscribe", map[string]string{"endpoint": "https://push.example/a"}), 401)
}

func TestPushKeyAndOffWithoutKeys(t *testing.T) {
	app, _ := pushApp(t)
	user := tradeNewUser(t, app, "business")

	res := status(t, user.c.Do("GET", "/api/push/key", nil), 200)
	if res.Body["enabled"] != true || res.Body["public_key"] != testVAPIDPublic {
		t.Fatalf("key: %s", res.Raw)
	}

	if strings.Contains(string(res.Raw), testVAPIDPrivate) {
		t.Fatal("the private key leaked")
	}

	// Clear the keys: `task` sets the dev pair in the environment.
	off := testutil.Server(t, func(c *config.Config) {
		c.VAPIDPublicKey, c.VAPIDPrivateKey = "", ""
	})
	person := tradeNewUser(t, off, "business")

	res = status(t, person.c.Do("GET", "/api/push/key", nil), 200)
	if res.Body["enabled"] != false || res.Body["public_key"] != "" {
		t.Fatalf("off key: %s", res.Raw)
	}

	status(t, person.c.Do("POST", "/api/push/subscriptions", pushBody("https://push.example/a")), 409)
}

func TestPushSubscribeValidation(t *testing.T) {
	app, _ := pushApp(t)
	user := tradeNewUser(t, app, "business")

	bad := []map[string]any{
		pushBody(""),
		pushBody("http://push.example/insecure"),
		pushBody("not a url"),
		{"endpoint": "https://push.example/a", "keys": map[string]string{"p256dh": "", "auth": "tBHItJI5svbpez7KI4CCXg"}},
		{"endpoint": "https://push.example/a", "keys": map[string]string{"p256dh": "BNcRdreALRFXTkOOUHK1EtK2", "auth": "bad key!"}},
		{"endpoint": "https://push.example/a"},
	}

	for _, body := range bad {
		status(t, user.c.Do("POST", "/api/push/subscriptions", body), 400)
	}

	status(t, user.c.Do("POST", "/api/push/unsubscribe", map[string]string{"endpoint": "ftp://x"}), 400)

	if got := pushEndpoints(t, app, user.id); got != "" {
		t.Fatalf("a bad subscription was saved: %s", got)
	}
}

func TestPushSubscriptionsBelongToTheCaller(t *testing.T) {
	app, _ := pushApp(t)
	a := tradeNewUser(t, app, "business")
	b := tradeNewUser(t, app, "collector")
	const endpoint = "https://push.example/a-browser"

	status(t, a.c.Do("POST", "/api/push/subscriptions", pushBody(endpoint)), 200)
	// A repeat from the same browser keeps one row.
	status(t, a.c.Do("POST", "/api/push/subscriptions", pushBody(endpoint)), 200)

	if got := pushEndpoints(t, app, a.id); got != endpoint {
		t.Fatalf("a's subscriptions: %q", got)
	}

	// B cannot remove A's subscription.
	status(t, b.c.Do("POST", "/api/push/unsubscribe", map[string]string{"endpoint": endpoint}), 200)

	if got := pushEndpoints(t, app, a.id); got != endpoint {
		t.Fatalf("b removed a's subscription: %q", got)
	}

	status(t, a.c.Do("POST", "/api/push/unsubscribe", map[string]string{"endpoint": endpoint}), 200)

	if got := pushEndpoints(t, app, a.id); got != "" {
		t.Fatalf("subscription survived unsubscribe: %q", got)
	}

	// The same browser signed in as someone else moves to them.
	status(t, a.c.Do("POST", "/api/push/subscriptions", pushBody(endpoint)), 200)
	status(t, b.c.Do("POST", "/api/push/subscriptions", pushBody(endpoint)), 200)

	if pushEndpoints(t, app, a.id) != "" || pushEndpoints(t, app, b.id) != endpoint {
		t.Fatal("the browser did not move to its new person")
	}
}

func TestPushGoesOnlyToTheNotifiedPerson(t *testing.T) {
	app, fake := pushApp(t)
	a := tradeNewUser(t, app, "business")
	b := tradeNewUser(t, app, "business")

	status(t, a.c.Do("POST", "/api/push/subscriptions", pushBody("https://push.example/a1")), 200)
	status(t, a.c.Do("POST", "/api/push/subscriptions", pushBody("https://push.example/a2")), 200)
	status(t, b.c.Do("POST", "/api/push/subscriptions", pushBody("https://push.example/b1")), 200)

	// A raw insert, like the follower and saved-search writers do.
	pushNote(t, app, "note-1", a.id, "/messages")

	got := map[string]map[string]any{}
	for range 2 {
		s := fake.next(t)
		got[s.endpoint] = s.payload
	}

	for _, endpoint := range []string{"https://push.example/a1", "https://push.example/a2"} {
		p := got[endpoint]
		if p == nil || p["title"] != "New message" || p["body"] != "Hi there" || p["link"] != "/messages" {
			t.Fatalf("push to %s: %v", endpoint, p)
		}
	}

	fake.quiet(t)

	// A link that leaves the app is not sent.
	pushNote(t, app, "note-2", b.id, "https://evil.example/x")

	if s := fake.next(t); s.endpoint != "https://push.example/b1" || s.payload["link"] != "" {
		t.Fatalf("push to b: %v", s)
	}
}

func TestPushGoneRemovesSubscriptionAndFailureKeepsTheAlert(t *testing.T) {
	app, fake := pushApp(t)
	a := tradeNewUser(t, app, "business")

	for _, endpoint := range []string{"https://push.example/gone", "https://push.example/down", "https://push.example/fine"} {
		status(t, a.c.Do("POST", "/api/push/subscriptions", pushBody(endpoint)), 200)
	}

	fake.status["https://push.example/gone"] = 410
	fake.fail["https://push.example/down"] = true

	pushNote(t, app, "note-3", a.id, "")

	for range 3 {
		fake.next(t)
	}

	// The in-app alert is there whatever the push services said.
	list := status(t, a.c.Do("GET", "/api/notifications", nil), 200)
	if n := len(tradeItems(list)); n != 1 {
		t.Fatalf("alert missing: %s", list.Raw)
	}

	// Only the 410 subscription is deleted; a plain failure keeps it.
	deadline := time.Now().Add(5 * time.Second)

	for pushEndpoints(t, app, a.id) != "https://push.example/down,https://push.example/fine" {
		if time.Now().After(deadline) {
			t.Fatalf("subscriptions: %s", pushEndpoints(t, app, a.id))
		}

		time.Sleep(50 * time.Millisecond)
	}
}
