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

func TestNotificationRequestActionsRetired(t *testing.T) {
	for _, action := range []string{"complete", "reject", "cancel"} {
		t.Run(action, func(t *testing.T) {
			w := newTradeWorld(t)
			outsider := tradeNewUser(t, w.app, "business")
			id := tradeRequest(t, w.buyer, w.seller, w.stock)
			unrelated := tradeRequest(t, w.buyer, w.seller, w.stock)
			tradeOffer(t, w.seller, unrelated, w.material, "2", "9")
			tradeOffer(t, w.seller, id, w.material, "2", "9")
			tradeWant(t, "first confirmation", w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)

			tradeWant(t, "outsider cannot close", outsider.c.Do("POST", "/api/requests/"+id+"/cancel", nil), 404)
			if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications
				WHERE link=$1 AND NOT read`, "/market/"+id); got != "3" {
				t.Fatalf("outsider changed action notices: %s", got)
			}

			actor := w.seller
			endpoint := action
			if action == "complete" {
				endpoint = "accept"
			} else if action == "cancel" {
				actor = w.buyer
			}
			tradeWant(t, "close request", actor.c.Do("POST", "/api/requests/"+id+"/"+endpoint, nil), 200)

			for _, party := range []tradeUser{w.buyer, w.seller} {
				page := party.c.Do("GET", "/api/notifications", nil)
				tradeWant(t, "participant notices", page, 200)
				for _, value := range tradeItems(page) {
					note := value.(map[string]any)
					if note["link"] != "/market/"+id {
						continue
					}
					title := note["title"].(string)
					if strings.Contains(title, "!") {
						t.Fatalf("exclamation in notification title: %v", note)
					}
					if title == "Offer received" || title == "Please confirm the offer" || title == "New request received" {
						if note["read"] != true {
							t.Fatalf("closed request still has an unread action: %v", note)
						}
					}
				}
			}

			if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications
				WHERE link=$1 AND NOT read`, "/market/"+unrelated); got != "2" {
				t.Fatalf("unrelated notices changed: %s", got)
			}
			if action == "complete" {
				if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications
					WHERE link=$1 AND title='Offer accepted' AND NOT read AND NOT dismissed`, "/market/"+id); got != "1" {
					t.Fatalf("completion notice lost: %s", got)
				}
			}
		})
	}
}

func TestWithdrawnNoticeRetiredOnRejection(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, id, w.material, "2", "9")
	tradeWant(t, "withdraw", w.seller.c.Do("POST", "/api/requests/"+id+"/withdraw", nil), 200)

	unread := `SELECT count(*)::text FROM notifications
		WHERE link=$1 AND title='Offer withdrawn' AND NOT read`
	if got := tradeText(t, w.app, unread, "/market/"+id); got != "1" {
		t.Fatalf("withdrawn notice should stay actionable while negotiating: %s", got)
	}

	tradeWant(t, "reject", w.seller.c.Do("POST", "/api/requests/"+id+"/reject", nil), 200)
	if got := tradeText(t, w.app, unread, "/market/"+id); got != "0" {
		t.Fatalf("withdrawn notice still unread after rejection: %s", got)
	}

	// History stays as sent.
	if got := tradeText(t, w.app, `SELECT body FROM notifications
		WHERE link=$1 AND title='Offer withdrawn'`, "/market/"+id); !strings.Contains(got, "Negotiation continues") {
		t.Fatalf("stored text was rewritten: %s", got)
	}
}
