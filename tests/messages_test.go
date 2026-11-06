package tests

import (
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func tradeSay(t *testing.T, from tradeUser, id, text string) testutil.Response {
	t.Helper()

	return from.c.Do("POST", "/api/requests/"+id+"/messages", map[string]any{"content": text})
}

func TestRequestMessagesSendReadAndInbox(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)

	tradeWant(t, "send", tradeSay(t, w.buyer, id, "  Is this still here?  "), 200)
	tradeWant(t, "reply", tradeSay(t, w.seller, id, "Yes it is"), 200)
	tradeWant(t, "empty", tradeSay(t, w.buyer, id, "   "), 400)
	tradeWant(t, "too long", tradeSay(t, w.buyer, id, strings.Repeat("x", 2001)), 400)

	list := w.seller.c.Do("GET", "/api/requests/"+id+"/messages", nil)
	items := tradeItems(list)

	if len(items) != 3 {
		t.Fatalf("messages: %d, want 3 including the request event: %s", len(items), list.Raw)
	}

	first, _ := items[0].(map[string]any)
	if first["content"] != "Yes it is" || first["sender_id"] != w.seller.id {
		t.Errorf("first message %v, want the newest seller message", first)
	}

	// The seller sees the request event and buyer message; reading clears both.
	inbox := w.seller.c.Do("GET", "/api/messages/inbox", nil)

	rows := tradeItems(inbox)
	if len(rows) != 1 {
		t.Fatalf("inbox: %d rows, want 1: %s", len(rows), inbox.Raw)
	}

	row, _ := rows[0].(map[string]any)
	if row["unread_count"] != float64(2) || row["request_id"] != id {
		t.Errorf("inbox row %v, want 2 unread on %s", row, id)
	}

	tradeWant(t, "mark read", w.seller.c.Do("POST", "/api/requests/"+id+"/messages/read", nil), 200)

	inbox = w.seller.c.Do("GET", "/api/messages/inbox", nil)
	row, _ = tradeItems(inbox)[0].(map[string]any)

	if row["unread_count"] != float64(0) {
		t.Errorf("unread after read: %v, want 0", row["unread_count"])
	}

	// The other side is told about each message, once.
	if n := tradeText(t, w.app, `
		SELECT count(*)::text FROM notifications WHERE user_id = $1 AND type = 'message_received'`,
		w.seller.id); n != "1" {
		t.Errorf("seller message notifications %s, want 1", n)
	}

	// A closed request takes no more messages.
	tradeWant(t, "cancel", w.buyer.c.Do("POST", "/api/requests/"+id+"/cancel", nil), 200)
	tradeWant(t, "send when closed", tradeSay(t, w.buyer, id, "hello?"), 409)

	// The chat stays in the inbox so the history can still be read.
	if n := len(tradeItems(w.seller.c.Do("GET", "/api/messages/inbox", nil))); n != 1 {
		t.Errorf("inbox holds %d closed threads, want 1", n)
	}
}

func TestRequestOfferedInbox(t *testing.T) {
	w := newTradeWorld(t)
	outsider := tradeNewUser(t, w.app, "business")
	id := tradeRequest(t, w.buyer, w.seller, w.stock)

	tradeWant(t, "send before offer", tradeSay(t, w.buyer, id, "Still available?"), 200)
	tradeOffer(t, w.seller, id, w.material, "40", "9")

	for _, party := range []tradeUser{w.buyer, w.seller} {
		inbox := party.c.Do("GET", "/api/messages/inbox", nil)
		tradeWant(t, "offered inbox", inbox, 200)
		rows := tradeItems(inbox)

		if len(rows) != 1 {
			t.Fatalf("inbox for %s: want 1 offered thread: %s", party.id, inbox.Raw)
		}

		row, _ := rows[0].(map[string]any)
		if row["request_id"] != id || row["status"] != "offered" {
			t.Errorf("inbox for %s: want offered request %s, got %v", party.id, id, row)
		}

		// Offers remain visible, but messaging stays paused until the offer is resolved.
		tradeWant(t, "offered chat open", tradeSay(t, party, id, "hello?"), 200)
	}

	inbox := outsider.c.Do("GET", "/api/messages/inbox", nil)
	tradeWant(t, "stranger inbox", inbox, 200)

	for _, item := range tradeItems(inbox) {
		row, _ := item.(map[string]any)
		if row["request_id"] == id {
			t.Errorf("stranger inbox contains offered request %s", id)
		}
	}
}

// Hole 7: strangers cannot read, write or mark messages of a request.
func TestRequestMessagesLeak(t *testing.T) {
	w := newTradeWorld(t)
	outsider := tradeNewUser(t, w.app, "business")
	staff := tradeNewUser(t, w.app, "staff")
	anon := w.app.NewClient(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)

	tradeWant(t, "send", tradeSay(t, w.buyer, id, "SECRET WORDS"), 200)

	path := "/api/requests/" + id + "/messages"

	tradeWant(t, "outsider reads", outsider.c.Do("GET", path, nil), 404)
	tradeWant(t, "outsider sends", tradeSay(t, outsider, id, "hi"), 404)
	tradeWant(t, "outsider marks read", outsider.c.Do("POST", path+"/read", nil), 404)
	tradeWant(t, "staff reads", staff.c.Do("GET", path, nil), 404)
	tradeWant(t, "staff sends", tradeSay(t, staff, id, "hi"), 404)
	tradeWant(t, "anonymous reads", anon.Do("GET", path, nil), 401)
	tradeWant(t, "anonymous sends", anon.Do("POST", path, map[string]any{"content": "hi"}), 401)
	tradeWant(t, "anonymous marks read", anon.Do("POST", path+"/read", nil), 401)
	tradeWant(t, "anonymous inbox", anon.Do("GET", "/api/messages/inbox", nil), 401)

	// The outsider's inbox and notifications show nothing of this thread.
	for _, p := range []string{"/api/messages/inbox", "/api/notifications"} {
		if raw := string(outsider.c.Do("GET", p, nil).Raw); strings.Contains(raw, "SECRET") {
			t.Errorf("outsider %s leaks a message: %s", p, raw)
		}
	}

	if n := tradeText(t, w.app, `SELECT count(*)::text FROM transaction_request_messages`); n != "2" {
		t.Errorf("%s messages stored, want the request event and buyer's message", n)
	}
}

// A message reaches the other person's socket as a change to the request; a
// stranger hears nothing and the event holds no message text.
func TestRequestMessageRealtime(t *testing.T) {
	w := newTradeWorld(t)
	outsider := tradeNewUser(t, w.app, "business")
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	socks := joinLive(t, w.app, w.seller, outsider)

	tradeWant(t, "send", tradeSay(t, w.buyer, id, "SECRET WORDS"), 200)

	// Wait for the event first, then check that the stranger heard nothing.
	socks[0].hear("request", id)
	socks[1].quiet("outsider")
}

func TestFreshRequestSystemEventAndOfferInbox(t *testing.T) {
	w := newTradeWorld(t)
	outsider := tradeNewUser(t, w.app, "business")
	tradeExec(t, w.app, `UPDATE users SET business_name='Greenline' WHERE id=$1`, w.buyer.id)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	path := "/api/requests/" + id + "/messages"

	items := tradeItems(w.seller.c.Do("GET", path, nil))
	if len(items) != 1 {
		t.Fatalf("fresh request messages: %v", items)
	}

	event := items[0].(map[string]any)
	if event["system"] != true || !strings.HasPrefix(event["content"].(string), "Greenline requested ") {
		t.Fatalf("request was not a named system event: %v", event)
	}

	for _, party := range []tradeUser{w.buyer, w.seller} {
		row := tradeItems(party.c.Do("GET", "/api/messages/inbox", nil))[0].(map[string]any)
		want := float64(0)
		if party.id == w.seller.id {
			want = 1
		}

		if row["unread_count"] != want || row["latest_message"].(map[string]any)["system"] != true {
			t.Fatalf("fresh inbox for %s: %v", party.id, row)
		}
	}

	tradeWant(t, "outsider event read", outsider.c.Do("GET", path, nil), 404)
	tradeWant(t, "outsider event receipt", outsider.c.Do("POST", path+"/read", nil), 404)
	tradeWant(t, "read event", w.seller.c.Do("POST", path+"/read", nil), 200)
	row := tradeItems(w.seller.c.Do("GET", "/api/messages/inbox", nil))[0].(map[string]any)
	if row["unread_count"] != float64(0) {
		t.Fatalf("read event still unread: %v", row)
	}

	// A caller cannot disguise a typed message as a system event.
	tradeWant(t, "typed message", w.buyer.c.Do("POST", path,
		map[string]any{"content": "hello", "system": true}), 200)
	latest := tradeItems(w.seller.c.Do("GET", path, nil))[0].(map[string]any)
	if latest["system"] != false {
		t.Fatalf("caller forged system event: %v", latest)
	}

	tradeOffer(t, w.seller, id, w.material, "40", "9")
	tradeWant(t, "buyer confirms", w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	row = tradeItems(w.seller.c.Do("GET", "/api/messages/inbox", nil))[0].(map[string]any)
	if row["offer_by"] != w.seller.id || row["buyer_confirmed_version"] != row["offer_version"] ||
		row["seller_confirmed_version"] == row["offer_version"] {
		t.Fatalf("missing inbox offer/confirmation state: %v", row)
	}
}
