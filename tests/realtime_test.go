package tests

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/fasthttp/websocket"

	"github.com/connor-davis/3reco/tests/testutil"
)

// socket is one open /api/live connection that reads in the test goroutine.
type socket struct {
	t    *testing.T
	conn *websocket.Conn
}

func dial(t *testing.T, app *testutil.App, c *testutil.Client, origin string) (*socket, *http.Response, error) {
	t.Helper()

	header := http.Header{"Origin": {origin}}

	if token := c.Cookie("threereco_session"); token != "" {
		header.Set("Cookie", "threereco_session="+token)
	}

	conn, resp, err := websocket.DefaultDialer.Dial("ws://"+app.Host+"/api/live", header)
	if err != nil {
		return nil, resp, err
	}

	t.Cleanup(func() { conn.Close() })

	return &socket{t: t, conn: conn}, resp, nil
}

func (s *socket) send(msg map[string]string) {
	s.t.Helper()

	if err := s.conn.WriteJSON(msg); err != nil {
		s.t.Fatalf("write: %v", err)
	}
}

// next reads one event. A read that times out kills the connection, so the
// tests only read when an event is due.
func (s *socket) next() map[string]any {
	s.t.Helper()

	_ = s.conn.SetReadDeadline(time.Now().Add(10 * time.Second))

	var ev map[string]any

	if err := s.conn.ReadJSON(&ev); err != nil {
		s.t.Fatalf("read: %v", err)
	}

	return ev
}

func userID(t *testing.T, c *testutil.Client) string {
	t.Helper()

	user, _ := c.Do("GET", "/api/auth/me", nil).Body["user"].(map[string]any)

	return user["id"].(string)
}

func TestLiveEventsReachOnlyTheAllowedClient(t *testing.T) {
	app := testutil.Server(t)
	a, b := app.NewClient(t), app.NewClient(t)
	emailA, emailB := signUp(t, app, a, true), signUp(t, app, b, true)

	signIn(t, a, emailA, goodPassword)
	signIn(t, b, emailB, goodPassword)

	idA, idB := userID(t, a), userID(t, b)
	topicA := "notifications:" + idA

	sockA, _, err := dial(t, app, a, testutil.WebOrigin)
	if err != nil {
		t.Fatalf("dial A: %v", err)
	}

	sockB, _, err := dial(t, app, b, testutil.WebOrigin)
	if err != nil {
		t.Fatalf("dial B: %v", err)
	}

	sockA.send(map[string]string{"type": "subscribe", "topic": topicA})

	// B asks for A's topic and is refused; B's own topic is fine.
	sockB.send(map[string]string{"type": "subscribe", "topic": topicA})

	if ev := sockB.next(); ev["type"] != "denied" || ev["topic"] != topicA {
		t.Fatalf("B on A's topic: %v, want denied", ev)
	}

	sockB.send(map[string]string{"type": "subscribe", "topic": "notifications:" + idB})
	// Admin topics are for staff only.
	sockB.send(map[string]string{"type": "subscribe", "topic": "admin:users"})

	if ev := sockB.next(); ev["type"] != "denied" || ev["topic"] != "admin:users" {
		t.Fatalf("B on admin:users: %v, want denied", ev)
	}

	// The subscribe messages are handled in order, so a ping answered means
	// A's subscribe is in place before the row below is written.
	sockA.send(map[string]string{"type": "ping"})

	if ev := sockA.next(); ev["type"] != "pong" {
		t.Fatalf("A ping: %v", ev)
	}

	_, err = app.DB.Pool.Exec(context.Background(), `
		INSERT INTO notifications (id, user_id, type, title, body)
		VALUES ('n1', $1, 'message_received', 'SECRET TITLE', 'SECRET BODY')`, idA)
	if err != nil {
		t.Fatal(err)
	}

	ev := sockA.next()
	if ev["type"] != "changed" || ev["topic"] != topicA || ev["id"] != "n1" {
		t.Fatalf("A event: %v", ev)
	}

	// An event names the topic and the row, and carries nothing else.
	raw, _ := json.Marshal(ev)
	if strings.Contains(string(raw), "SECRET") || len(ev) != 3 {
		t.Fatalf("event holds row data: %s", raw)
	}

	// B heard nothing: the next thing on B's socket is the answer to this ping.
	sockB.send(map[string]string{"type": "ping"})

	if ev := sockB.next(); ev["type"] != "pong" {
		t.Fatalf("B heard %v before its pong", ev)
	}

	// After unsubscribe A hears nothing either.
	sockA.send(map[string]string{"type": "unsubscribe", "topic": topicA})
	sockA.send(map[string]string{"type": "ping"})

	if ev := sockA.next(); ev["type"] != "pong" {
		t.Fatalf("A ping: %v", ev)
	}

	_, err = app.DB.Pool.Exec(context.Background(),
		`UPDATE notifications SET read = true WHERE id = 'n1'`)
	if err != nil {
		t.Fatal(err)
	}

	time.Sleep(300 * time.Millisecond)
	sockA.send(map[string]string{"type": "ping"})

	if ev := sockA.next(); ev["type"] != "pong" {
		t.Fatalf("A heard %v after unsubscribing", ev)
	}
}

func TestLiveHandshakeIsChecked(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)

	// No cookie: refused with 401.
	if _, resp, err := dial(t, app, c, testutil.WebOrigin); err == nil || resp == nil || resp.StatusCode != 401 {
		t.Fatalf("no cookie: err=%v resp=%v, want a 401 handshake", err, resp)
	}

	signIn(t, c, signUp(t, app, c, true), goodPassword)

	// A signed-in browser on another site: refused with 403.
	if _, resp, err := dial(t, app, c, "https://evil.example"); err == nil || resp == nil || resp.StatusCode != 403 {
		t.Fatalf("bad origin: err=%v resp=%v, want a 403 handshake", err, resp)
	}

	// A plain GET (not a socket) is told to upgrade.
	if res := c.Do("GET", "/api/live", nil); res.Status != 426 {
		t.Errorf("plain GET: %d, want 426", res.Status)
	}
}

func TestLiveSocketAnswersPing(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)

	email := signUp(t, app, c, true)
	signIn(t, c, email, goodPassword)

	sock, _, err := dial(t, app, c, testutil.WebOrigin)
	if err != nil {
		t.Fatal(err)
	}

	sock.send(map[string]string{"type": "ping"})

	if ev := sock.next(); ev["type"] != "pong" {
		t.Fatalf("ping: %v", ev)
	}
}

func TestLiveRecheckDropsRemovedUserAndLostRequestAccess(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	topic := "request:" + id
	ctx := context.Background()

	buyerSock, _, err := dial(t, w.app, w.buyer.c, testutil.WebOrigin)
	if err != nil {
		t.Fatal(err)
	}

	sellerSock, _, err := dial(t, w.app, w.seller.c, testutil.WebOrigin)
	if err != nil {
		t.Fatal(err)
	}

	for _, sock := range []*socket{buyerSock, sellerSock} {
		sock.send(map[string]string{"type": "subscribe", "topic": topic})
		sock.send(map[string]string{"type": "ping"})

		if ev := sock.next(); ev["type"] != "pong" {
			t.Fatalf("subscription barrier: %v", ev)
		}
	}

	touch := `UPDATE transaction_requests SET updated_at = now() WHERE id = $1`

	// Two people who still have access keep their topic through a recheck.
	w.app.Hub.Recheck(ctx)

	if _, err := w.app.DB.Pool.Exec(ctx, touch, id); err != nil {
		t.Fatal(err)
	}

	for _, sock := range []*socket{buyerSock, sellerSock} {
		if ev := sock.next(); ev["type"] != "changed" || ev["topic"] != topic {
			t.Fatalf("kept topic: %v", ev)
		}
	}

	// The buyer loses access when the request moves to someone else.
	_, err = w.app.DB.Pool.Exec(ctx, `UPDATE transaction_requests SET buyer_id = $2 WHERE id = $1`, id, other.id)
	if err != nil {
		t.Fatal(err)
	}

	for _, sock := range []*socket{buyerSock, sellerSock} {
		if ev := sock.next(); ev["type"] != "changed" {
			t.Fatalf("move event: %v", ev)
		}
	}

	w.app.Hub.Recheck(ctx)

	if _, err := w.app.DB.Pool.Exec(ctx, touch, id); err != nil {
		t.Fatal(err)
	}

	if ev := sellerSock.next(); ev["type"] != "changed" {
		t.Fatalf("seller kept topic: %v", ev)
	}

	buyerSock.send(map[string]string{"type": "ping"})

	if ev := buyerSock.next(); ev["type"] != "pong" {
		t.Fatalf("buyer heard %v after losing the request", ev)
	}

	// A removed user's socket is closed.
	if _, err := w.app.DB.Pool.Exec(ctx, `UPDATE users SET is_removed = true WHERE id = $1`, w.seller.id); err != nil {
		t.Fatal(err)
	}

	w.app.Hub.Recheck(ctx)

	_ = sellerSock.conn.SetReadDeadline(time.Now().Add(5 * time.Second))

	var ev map[string]any

	err = sellerSock.conn.ReadJSON(&ev)

	var timeout net.Error
	if err == nil || (errors.As(err, &timeout) && timeout.Timeout()) {
		t.Fatalf("removed user's socket still open: %v %v", ev, err)
	}
}
