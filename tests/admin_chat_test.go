package tests

import (
	"testing"
)

func TestAdminReadsAnyChatButChangesNothing(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	stranger := tradeNewUser(t, w.app, "business")
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	path := "/api/requests/" + id

	tradeWant(t, "buyer message", tradeSay(t, w.buyer, id, "Is this still here?"), 200)

	// The admin reads the chat.
	read := admin.c.Do("GET", path+"/messages", nil)
	tradeWant(t, "admin reads chat", read, 200)

	if n := len(tradeItems(read)); n != 2 {
		t.Fatalf("admin sees %d messages, want 2: %s", n, read.Raw)
	}

	tradeWant(t, "admin reads request", admin.c.Do("GET", path, nil), 200)
	tradeWant(t, "admin missing chat", admin.c.Do("GET", "/api/requests/nope/messages", nil), 404)

	// Staff and strangers still cannot read it.
	tradeWant(t, "staff reads chat", staff.c.Do("GET", path+"/messages", nil), 404)
	tradeWant(t, "stranger reads chat", stranger.c.Do("GET", path+"/messages", nil), 404)

	// The admin cannot write, mark read, or move the request.
	tradeWant(t, "admin sends", tradeSay(t, admin, id, "hello"), 403)
	tradeWant(t, "admin marks read", admin.c.Do("POST", path+"/messages/read", nil), 403)
	tradeWant(t, "admin cancels", admin.c.Do("POST", path+"/cancel", nil), 403)
	tradeWant(t, "staff sends", tradeSay(t, staff, id, "hello"), 404)

	// Reading left no receipt, so the seller still has one unread message.
	if n := tradeText(t, w.app, `
		SELECT count(*)::text FROM request_message_reads x
		JOIN transaction_request_messages m ON m.id = x.message_id
		WHERE m.request_id = $1`, id); n != "0" {
		t.Errorf("read receipts after an admin read: %s, want 0", n)
	}

	rows := tradeItems(w.seller.c.Do("GET", "/api/messages/inbox", nil))
	row, _ := rows[0].(map[string]any)

	if row["unread_count"] != float64(2) {
		t.Errorf("seller unread %v, want 2", row["unread_count"])
	}

	if n := len(tradeItems(admin.c.Do("GET", "/api/messages/inbox", nil))); n != 0 {
		t.Errorf("admin own inbox holds %d threads, want 0", n)
	}
}

func TestAdminAllConversations(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	id := tradeRequest(t, w.buyer, w.seller, w.stock)

	tradeWant(t, "message", tradeSay(t, w.buyer, id, "Still available?"), 200)

	list := admin.c.Do("GET", "/api/messages/all", nil)
	tradeWant(t, "admin list", list, 200)

	rows := tradeItems(list)
	if len(rows) != 1 {
		t.Fatalf("admin list has %d rows, want 1: %s", len(rows), list.Raw)
	}

	row, _ := rows[0].(map[string]any)
	buyer, _ := row["buyer"].(map[string]any)
	seller, _ := row["seller"].(map[string]any)
	last, _ := row["latest_message"].(map[string]any)

	if row["request_id"] != id || buyer["id"] != w.buyer.id || seller["id"] != w.seller.id {
		t.Errorf("unexpected row: %s", list.Raw)
	}

	if last["content"] != "Still available?" {
		t.Errorf("latest message %v, want the buyer's", last)
	}

	// A closed request stays in the list: admins settle disputes after the fact.
	tradeWant(t, "cancel", w.buyer.c.Do("POST", "/api/requests/"+id+"/cancel", nil), 200)

	if n := len(tradeItems(admin.c.Do("GET", "/api/messages/all", nil))); n != 1 {
		t.Errorf("closed request left the admin list: %d rows", n)
	}

	tradeWant(t, "staff list", staff.c.Do("GET", "/api/messages/all", nil), 403)
	tradeWant(t, "business list", w.buyer.c.Do("GET", "/api/messages/all", nil), 403)
	tradeWant(t, "anonymous list", w.app.NewClient(t).Do("GET", "/api/messages/all", nil), 401)
}

func TestAdminHearsLiveChatEvents(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	socks := joinLive(t, w.app, admin, w.seller, staff)

	tradeWant(t, "send", tradeSay(t, w.buyer, id, "An unloaded chat changed"), 200)

	// Admin and the other person need no subscription; staff cannot read chats.
	socks[0].hear("request", id)
	socks[1].hear("request", id)
	socks[2].quiet("staff")
}
