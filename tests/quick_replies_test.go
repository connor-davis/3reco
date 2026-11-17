package tests

import (
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func addReply(t *testing.T, user tradeUser, body string) string {
	t.Helper()
	res := status(t, user.c.Do("POST", "/api/quick-replies", map[string]any{"body": body}), 201)

	return res.Body["id"].(string)
}

func replyItems(t *testing.T, user tradeUser) []map[string]any {
	t.Helper()

	return pageItems(t, status(t, user.c.Do("GET", "/api/quick-replies", nil), 200))
}

func TestQuickRepliesCRUD(t *testing.T) {
	app := testutil.Server(t)
	user := tradeNewUser(t, app, "business")

	if len(replyItems(t, user)) != 0 {
		t.Fatal("a new person starts with no replies")
	}

	// Text is trimmed before it is saved.
	id := addReply(t, user, "  On my way  ")
	second := addReply(t, user, "Thanks!")

	items := replyItems(t, user)
	if len(items) != 2 || items[0]["id"] != id || items[0]["body"] != "On my way" ||
		items[1]["id"] != second {
		t.Fatalf("replies: %v", items)
	}

	status(t, user.c.Do("PATCH", "/api/quick-replies/"+id, map[string]any{"body": " Almost there "}), 200)
	if got := replyItems(t, user)[0]["body"]; got != "Almost there" {
		t.Fatalf("edited body %v", got)
	}

	status(t, user.c.Do("DELETE", "/api/quick-replies/"+id, nil), 200)
	status(t, user.c.Do("DELETE", "/api/quick-replies/"+id, nil), 404)
	if items := replyItems(t, user); len(items) != 1 || items[0]["id"] != second {
		t.Fatalf("after delete: %v", items)
	}

	// A collector can keep replies too.
	collector := tradeNewUser(t, app, "collector")
	addReply(t, collector, "Hello")
}

func TestQuickRepliesBelongToOnePerson(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")
	id := addReply(t, owner, "Mine")

	// Naming the owner in the URL cannot change whose list is read.
	res := status(t, other.c.Do("GET", "/api/quick-replies?user_id="+owner.id, nil), 200)
	if len(pageItems(t, res)) != 0 {
		t.Fatalf("another person saw the reply: %s", res.Raw)
	}

	status(t, other.c.Do("PATCH", "/api/quick-replies/"+id, map[string]any{"body": "Stolen"}), 404)
	status(t, other.c.Do("DELETE", "/api/quick-replies/"+id, nil), 404)

	items := replyItems(t, owner)
	if len(items) != 1 || items[0]["body"] != "Mine" {
		t.Fatalf("another person changed the reply: %v", items)
	}

	// The other person's list and limit are their own.
	addReply(t, other, "Theirs")
	if len(replyItems(t, owner)) != 1 {
		t.Fatal("replies leaked between people")
	}
}

func TestQuickRepliesRefuseBadText(t *testing.T) {
	app := testutil.Server(t)
	user := tradeNewUser(t, app, "business")
	id := addReply(t, user, "Fine")

	for _, body := range []string{"", "   ", strings.Repeat("a", 501)} {
		status(t, user.c.Do("POST", "/api/quick-replies", map[string]any{"body": body}), 400)
		status(t, user.c.Do("PATCH", "/api/quick-replies/"+id, map[string]any{"body": body}), 400)
	}

	// Exactly 500 characters, counting letters rather than bytes, is allowed.
	addReply(t, user, strings.Repeat("é", 500))
	if got := replyItems(t, user)[0]["body"]; got != "Fine" {
		t.Fatalf("a refused edit changed the reply: %v", got)
	}
}

func TestQuickRepliesCapAtTwenty(t *testing.T) {
	app := testutil.Server(t)
	user := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")

	var last string
	for i := 0; i < 20; i++ {
		last = addReply(t, user, "Reply "+string(rune('a'+i)))
	}

	status(t, user.c.Do("POST", "/api/quick-replies", map[string]any{"body": "One too many"}), 409)

	// Someone else is not held back by this person's list.
	addReply(t, other, "Still fine")

	// Deleting one makes room again.
	status(t, user.c.Do("DELETE", "/api/quick-replies/"+last, nil), 200)
	addReply(t, user, "Room again")
	if len(replyItems(t, user)) != 20 {
		t.Fatal("the list should hold exactly 20")
	}
}

func TestQuickRepliesNeedSignInAndSetup(t *testing.T) {
	app := testutil.Server(t)

	anonymous := app.NewClient(t)
	status(t, anonymous.Do("GET", "/api/quick-replies", nil), 401)
	status(t, anonymous.Do("POST", "/api/quick-replies", map[string]any{"body": "x"}), 401)
	status(t, anonymous.Do("PATCH", "/api/quick-replies/nope", map[string]any{"body": "x"}), 401)
	status(t, anonymous.Do("DELETE", "/api/quick-replies/nope", nil), 401)

	guest, _ := newGuest(t, app)
	status(t, guest.Do("GET", "/api/quick-replies", nil), 403)
	status(t, guest.Do("POST", "/api/quick-replies", map[string]any{"body": "x"}), 403)
}
