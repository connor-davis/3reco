package tests

import (
	"strings"
	"testing"
)

func tradeNote(t *testing.T, w tradeWorld, owner tradeUser, id string) {
	t.Helper()

	tradeExec(t, w.app, `
		INSERT INTO notifications (id, user_id, type, title, body)
		VALUES ($1, $2, 'message_received', 'SECRET TITLE', 'SECRET BODY')`, id, owner.id)
}

func TestNotifications(t *testing.T) {
	w := newTradeWorld(t)
	tradeNote(t, w, w.seller, "n1")
	tradeNote(t, w, w.seller, "n2")
	tradeNote(t, w, w.buyer, "n3")

	list := w.seller.c.Do("GET", "/api/notifications", nil)
	tradeWant(t, "list", list, 200)

	if n := len(tradeItems(list)); n != 2 {
		t.Fatalf("seller sees %d notifications, want 2: %s", n, list.Raw)
	}

	count := w.seller.c.Do("GET", "/api/notifications/unread-count", nil)
	if count.Body["count"] != float64(2) {
		t.Errorf("unread %v, want 2", count.Body["count"])
	}

	tradeWant(t, "mark read", w.seller.c.Do("PATCH", "/api/notifications/n1/read", nil), 200)

	if got := w.seller.c.Do("GET", "/api/notifications/unread-count", nil).Body["count"]; got != float64(1) {
		t.Errorf("unread %v after one read, want 1", got)
	}

	tradeWant(t, "dismiss", w.seller.c.Do("DELETE", "/api/notifications/n1", nil), 200)

	if n := len(tradeItems(w.seller.c.Do("GET", "/api/notifications", nil))); n != 1 {
		t.Errorf("seller sees %d after a dismiss, want 1", n)
	}

	tradeWant(t, "read all", w.seller.c.Do("POST", "/api/notifications/read-all", nil), 200)

	if got := w.seller.c.Do("GET", "/api/notifications/unread-count", nil).Body["count"]; got != float64(0) {
		t.Errorf("unread %v after read-all, want 0", got)
	}

	tradeWant(t, "dismiss all", w.seller.c.Do("DELETE", "/api/notifications", nil), 200)

	if n := len(tradeItems(w.seller.c.Do("GET", "/api/notifications", nil))); n != 0 {
		t.Errorf("seller sees %d after dismiss-all, want 0", n)
	}

	// None of that touched the buyer's notification.
	if n := tradeText(t, w.app, `
		SELECT count(*)::text FROM notifications WHERE id = 'n3' AND NOT read AND NOT dismissed`); n != "1" {
		t.Errorf("buyer's notification changed by the seller's actions")
	}
}

func TestNotificationsAccess(t *testing.T) {
	w := newTradeWorld(t)
	anon := w.app.NewClient(t)

	tradeNote(t, w, w.seller, "n1")

	// Someone else's notification looks missing, and stays untouched.
	tradeWant(t, "read another's", w.buyer.c.Do("PATCH", "/api/notifications/n1/read", nil), 404)
	tradeWant(t, "dismiss another's", w.buyer.c.Do("DELETE", "/api/notifications/n1", nil), 404)

	if raw := string(w.buyer.c.Do("GET", "/api/notifications", nil).Raw); strings.Contains(raw, "SECRET") {
		t.Errorf("buyer's list leaks another user's notification: %s", raw)
	}

	// The bulk calls only act on the caller's own rows.
	tradeWant(t, "read all", w.buyer.c.Do("POST", "/api/notifications/read-all", nil), 200)
	tradeWant(t, "dismiss all", w.buyer.c.Do("DELETE", "/api/notifications", nil), 200)

	if n := tradeText(t, w.app, `
		SELECT count(*)::text FROM notifications WHERE id = 'n1' AND NOT read AND NOT dismissed`); n != "1" {
		t.Errorf("the buyer's bulk calls changed the seller's notification")
	}

	for _, call := range [][2]string{
		{"GET", "/api/notifications"},
		{"GET", "/api/notifications/unread-count"},
		{"POST", "/api/notifications/read-all"},
		{"PATCH", "/api/notifications/n1/read"},
		{"DELETE", "/api/notifications/n1"},
		{"DELETE", "/api/notifications"},
	} {
		tradeWant(t, "anonymous "+call[0]+" "+call[1], anon.Do(call[0], call[1], nil), 401)
	}
}
