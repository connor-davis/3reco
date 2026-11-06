package tests

import "testing"

// A finished chat stays in the inbox under All, and "done" shows only the
// finished ones. An outsider never sees either.
func TestInboxKeepsFinishedChats(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")
	open := tradeRequest(t, w.buyer, w.seller, w.stock)
	done := tradeRequest(t, w.buyer, w.seller, w.stock)

	tradeExec(t, w.app, `UPDATE transaction_requests SET status = 'accepted' WHERE id = $1`, done)

	for _, who := range []tradeUser{w.buyer, w.seller} {
		all := who.c.Do("GET", "/api/messages/inbox", nil)
		tradeWant(t, "all", all, 200)

		if got := len(tradeItems(all)); got != 2 {
			t.Errorf("All shows %d chats, want 2: %s", got, all.Raw)
		}

		finished := who.c.Do("GET", "/api/messages/inbox?filter=done", nil)
		tradeWant(t, "done", finished, 200)

		rows := tradeItems(finished)
		if len(rows) != 1 || rows[0].(map[string]any)["request_id"] != done {
			t.Errorf("done filter = %s, want only %s (open is %s)", finished.Raw, done, open)
		}
	}

	outsider := stranger.c.Do("GET", "/api/messages/inbox?filter=done", nil)
	tradeWant(t, "outsider", outsider, 200)

	if rows := tradeItems(outsider); len(rows) != 0 {
		t.Errorf("outsider sees finished chats: %s", outsider.Raw)
	}

	// Staff and admin may read the all-chats list; only the done filter differs.
	admin := tradeNewUser(t, w.app, "admin")
	adminDone := admin.c.Do("GET", "/api/messages/all?filter=done", nil)
	tradeWant(t, "admin done", adminDone, 200)

	if rows := tradeItems(adminDone); len(rows) != 1 {
		t.Errorf("admin done filter shows %d chats, want 1: %s", len(rows), adminDone.Raw)
	}

	tradeWant(t, "buyer cannot read all-chats list", w.buyer.c.Do("GET", "/api/messages/all", nil), 403)
}
