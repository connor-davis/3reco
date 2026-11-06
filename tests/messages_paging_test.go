package tests

import (
	"fmt"
	"net/url"
	"testing"
)

func TestInboxSearchAndFiltersBeforePaging(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	stranger := tradeNewUser(t, w.app, "business")
	old := tradeRequest(t, w.buyer, w.seller, w.stock)
	private := tradeRequest(t, stranger, w.seller, w.stock)

	tradeWant(t, "old message", tradeSay(t, w.seller, old, "needle only in older chat"), 200)
	tradeWant(t, "private message", tradeSay(t, stranger, private, "secret outsider needle"), 200)
	tradeExec(t, w.app, `
		INSERT INTO transaction_requests (id, buyer_id, seller_id, status)
		SELECT 'newer-' || n, $1, $2, 'pending' FROM generate_series(1, 35) n`,
		w.buyer.id, w.seller.id)

	for _, inbox := range []struct {
		user tradeUser
		path string
	}{{w.buyer, "/api/messages/inbox"}, {admin, "/api/messages/all"}} {
		first := inbox.user.c.Do("GET", inbox.path+"?limit=30", nil)
		tradeWant(t, "first page", first, 200)

		if len(tradeItems(first)) != 30 || first.Body["has_more"] != true {
			t.Fatalf("expected a full first page: %s", first.Raw)
		}

		for _, item := range tradeItems(first) {
			if item.(map[string]any)["request_id"] == old {
				t.Fatal("search fixture unexpectedly on first page")
			}
		}

		found := inbox.user.c.Do("GET", inbox.path+"?limit=30&q=needle+only", nil)
		tradeWant(t, "search older page", found, 200)

		if rows := tradeItems(found); len(rows) != 1 || rows[0].(map[string]any)["request_id"] != old {
			t.Fatalf("server did not search beyond first page: %s", found.Raw)
		}

		name := tradeText(t, w.app, `SELECT business_name FROM users WHERE id = $1`, w.seller.id)
		for _, term := range []string{name, "Glass"} {
			matched := inbox.user.c.Do("GET", inbox.path+"?q="+url.QueryEscape(term), nil)
			tradeWant(t, "name or material search", matched, 200)

			if len(tradeItems(matched)) == 0 {
				t.Fatalf("no matches for %q: %s", term, matched.Raw)
			}
		}
	}

	leak := w.buyer.c.Do("GET", "/api/messages/inbox?q=secret+outsider", nil)
	tradeWant(t, "scoped search", leak, 200)

	if len(tradeItems(leak)) != 0 {
		t.Fatalf("search leaked outsider conversation: %s", leak.Raw)
	}

	unread := w.buyer.c.Do("GET", "/api/messages/inbox?filter=unread&limit=1", nil)
	if rows := tradeItems(unread); len(rows) != 1 || rows[0].(map[string]any)["request_id"] != old {
		t.Fatalf("unread not filtered before limit: %s", unread.Raw)
	}

	tradeWant(t, "read", w.buyer.c.Do("POST", "/api/requests/"+old+"/messages/read", nil), 200)
	readInbox := w.buyer.c.Do("GET", "/api/messages/inbox?filter=unread", nil)
	if rows := tradeItems(readInbox); len(rows) != 0 {
		t.Fatalf("read conversation still unread: %v", rows)
	}

	tradeOffer(t, w.seller, old, w.material, "40", "9")
	for _, inbox := range []struct {
		user tradeUser
		path string
	}{{w.buyer, "/api/messages/inbox"}, {admin, "/api/messages/all"}} {
		offers := inbox.user.c.Do("GET", inbox.path+"?filter=offers&limit=1", nil)
		if rows := tradeItems(offers); len(rows) != 1 || rows[0].(map[string]any)["request_id"] != old {
			t.Fatalf("offers not filtered before limit: %s", offers.Raw)
		}
	}

	adminUnread := admin.c.Do("GET", "/api/messages/all?filter=unread", nil)
	tradeWant(t, "admin unread meaningless", adminUnread, 400)
	tradeWant(t, "invalid filter", w.buyer.c.Do("GET", "/api/messages/inbox?filter=nope", nil), 400)
}

func TestMessagesNewestPageThenOlder(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeExec(t, w.app, `
		INSERT INTO transaction_request_messages (id, request_id, sender_id, content, created_at)
		SELECT lpad(n::text, 4, '0'), $1, $2, 'Message ' || n, now()
		FROM generate_series(1, 75) n`, id, w.buyer.id)

	path := "/api/requests/" + id + "/messages?limit=30"
	seen := map[string]bool{}
	count := 0

	for {
		page := w.seller.c.Do("GET", path, nil)
		tradeWant(t, "message page", page, 200)

		for _, item := range tradeItems(page) {
			message := item.(map[string]any)
			if message["system"] == true {
				continue
			}
			want := fmt.Sprintf("%04d", 75-count)
			if message["id"] != want || seen[want] {
				t.Fatalf("message %v, expected newest-first %s", message, want)
			}

			seen[want] = true
			count++
		}

		if page.Body["has_more"] != true {
			break
		}

		path = "/api/requests/" + id + "/messages?limit=30&cursor=" +
			url.QueryEscape(page.Body["next_cursor"].(string))
	}

	if count != 75 {
		t.Fatalf("got %d messages, want 75", count)
	}
}
