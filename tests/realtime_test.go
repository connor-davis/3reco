package tests

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync/atomic"
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

// hear waits for the "changed" event with this kind and id. Other events the
// same write caused may come first; they are skipped. The wanted event must
// hold exactly the keys type, kind and id, so no row data rides along.
func (s *socket) hear(kind, id string) {
	s.t.Helper()

	for range 20 {
		ev := s.next()
		if ev["type"] != "changed" || ev["kind"] != kind || ev["id"] != id {
			continue
		}

		keys := 0

		for _, key := range []string{"type", "kind", "id"} {
			if _, ok := ev[key]; ok {
				keys++
			}
		}

		if len(ev) != 3 || keys != 3 {
			s.t.Fatalf("event keys %v, want exactly type, kind and id", ev)
		}

		return
	}

	s.t.Fatalf("never heard changed %s %s", kind, id)
}

// quiet proves nothing is waiting on the socket: the next frame is the answer
// to a ping sent now. Call it only after the wanted listener heard its event,
// which means the hub already routed this change to everyone.
func (s *socket) quiet(who string) {
	s.t.Helper()

	s.send(map[string]string{"type": "ping"})

	if ev := s.next(); ev["type"] != "pong" {
		s.t.Fatalf("%s heard %v, want silence", who, ev)
	}
}

// markers numbers the sync points so two never look alike.
var markers atomic.Int64

// settle clears events still in flight from earlier writes. NOTIFYs reach the
// hub in commit order, so once a marker for everyone has come through, every
// older event has been delivered and thrown away.
func settle(t *testing.T, app *testutil.App, socks ...*socket) {
	t.Helper()

	id := fmt.Sprintf("marker-%d", markers.Add(1))
	payload := `{"kind":"marker","id":"` + id + `","op":"insert","users":[],"aud":"all"}`

	if _, err := app.DB.Pool.Exec(context.Background(), `SELECT pg_notify('threereco_changes', $1)`, payload); err != nil {
		t.Fatal(err)
	}

	for _, s := range socks {
		s.hear("marker", id)
	}
}

// joinLive opens a socket for each person and settles them.
func joinLive(t *testing.T, app *testutil.App, people ...tradeUser) []*socket {
	t.Helper()

	socks := make([]*socket, len(people))

	for i, p := range people {
		sock, _, err := dial(t, app, p.c, testutil.WebOrigin)
		if err != nil {
			t.Fatalf("dial: %v", err)
		}

		socks[i] = sock
	}

	settle(t, app, socks...)

	return socks
}

// closedByServer reports whether the server closes the socket, ignoring any
// events that were already on their way.
func closedByServer(s *socket) bool {
	for range 5 {
		_ = s.conn.SetReadDeadline(time.Now().Add(5 * time.Second))

		var ev map[string]any

		err := s.conn.ReadJSON(&ev)

		var timeout net.Error
		if errors.As(err, &timeout) && timeout.Timeout() {
			return false
		}

		if err != nil {
			return true
		}
	}

	return false
}

func userID(t *testing.T, c *testutil.Client) string {
	t.Helper()

	user, _ := c.Do("GET", "/api/auth/me", nil).Body["user"].(map[string]any)

	return user["id"].(string)
}

func TestLiveHandshakeIsChecked(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)

	// No cookie: refused with 401.
	if _, resp, err := dial(t, app, c, testutil.WebOrigin); err == nil || resp == nil || resp.StatusCode != 401 {
		t.Fatalf("no cookie: err=%v resp=%v, want a 401 handshake", err, resp)
	}

	signIn(t, c, signUp(t, app, c, true), goodPassword)
	tradeExec(t, app, `UPDATE users SET role = 'business' WHERE id = $1`, userID(t, c))

	// A signed-in browser on another site: refused with 403.
	if _, resp, err := dial(t, app, c, "https://evil.example"); err == nil || resp == nil || resp.StatusCode != 403 {
		t.Fatalf("bad origin: err=%v resp=%v, want a 403 handshake", err, resp)
	}

	// The Go server also serves the built app, so its own address is allowed.
	if _, _, err := dial(t, app, c, "http://"+app.Host); err != nil {
		t.Fatalf("same-host origin: %v, want a socket", err)
	}

	// A plain GET (not a socket) is told to upgrade.
	if res := c.Do("GET", "/api/live", nil); res.Status != 426 {
		t.Errorf("plain GET: %d, want 426", res.Status)
	}
}

// A guest has not finished setup, but may hold a socket: it hears only events
// sent to their own id, never a group event.
func TestLiveGuestSocketIsQuietExceptForSelf(t *testing.T) {
	app := testutil.Server(t)
	guest, _ := newGuest(t, app)
	other := tradeNewUser(t, app, "business")

	sock, _, err := dial(t, app, guest, testutil.WebOrigin)
	if err != nil {
		t.Fatalf("guest handshake: %v", err)
	}

	listener := joinLive(t, app, other)[0]

	payload := `{"kind":"listing","id":"l1","op":"insert","users":[],"aud":"all"}`
	if _, err := app.DB.Pool.Exec(context.Background(), `SELECT pg_notify('threereco_changes', $1)`, payload); err != nil {
		t.Fatal(err)
	}

	listener.hear("listing", "l1")
	sock.quiet("guest")

	// Someone with no cookie is still refused.
	if _, resp, err := dial(t, app, app.NewClient(t), testutil.WebOrigin); err == nil || resp == nil || resp.StatusCode != 401 {
		t.Fatalf("anonymous handshake: err=%v resp=%v, want a 401", err, resp)
	}
}

func TestLiveSocketAnswersPing(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)

	email := signUp(t, app, c, true)
	signIn(t, c, email, goodPassword)
	tradeExec(t, app, `UPDATE users SET role = 'business' WHERE id = $1`, userID(t, c))

	sock, _, err := dial(t, app, c, testutil.WebOrigin)
	if err != nil {
		t.Fatal(err)
	}

	sock.send(map[string]string{"type": "ping"})

	if ev := sock.next(); ev["type"] != "pong" {
		t.Fatalf("ping: %v", ev)
	}
}

// A page cannot choose what it hears: a subscribe message changes nothing.
func TestLiveSubscribeMessagesDoNothing(t *testing.T) {
	w := newTradeWorld(t)
	socks := joinLive(t, w.app, w.buyer, w.seller)
	buyer, seller := socks[0], socks[1]

	buyer.send(map[string]string{"type": "subscribe", "topic": "notifications:" + w.seller.id})

	tradeExec(t, w.app, `
		INSERT INTO notifications (id, user_id, type, title, body)
		VALUES ('n-sub', $1, 'message_received', 'Hi', 'There')`, w.seller.id)

	seller.hear("notification", "n-sub")
	buyer.quiet("buyer")
}

// A removed user's socket is closed on the next recheck.
func TestLiveRecheckClosesRemovedUser(t *testing.T) {
	w := newTradeWorld(t)
	sock := joinLive(t, w.app, w.seller)[0]
	ctx := context.Background()

	// A user who is still fine keeps the socket through a recheck.
	w.app.Hub.Recheck(ctx)
	sock.quiet("seller")

	if _, err := w.app.DB.Pool.Exec(ctx, `UPDATE users SET is_removed = true WHERE id = $1`, w.seller.id); err != nil {
		t.Fatal(err)
	}

	w.app.Hub.Recheck(ctx)

	if !closedByServer(sock) {
		t.Fatal("removed user's socket still open")
	}
}

// A read receipt writes no live frame (0009): the other person only hears the
// message itself.
func TestReadReceiptSendsNoChangedFrame(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	sock := joinLive(t, w.app, w.seller)[0]

	// A new message must be heard, so a silent socket below means something.
	tradeWant(t, "send", tradeSay(t, w.buyer, id, "Hello"), 200)
	sock.hear("request", id)

	// The message also raised a notification; let everything in flight pass.
	settle(t, w.app, sock)

	tradeWant(t, "mark read", w.seller.c.Do("POST", "/api/requests/"+id+"/messages/read", nil), 200)

	time.Sleep(300 * time.Millisecond)
	sock.quiet("seller")
}
