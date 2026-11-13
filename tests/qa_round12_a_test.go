package tests

import (
	"net/url"
	"slices"
	"strconv"
	"testing"
	"time"

	"github.com/connor-davis/3reco/tests/testutil"
)

// HA1: removing an account closes its open socket at once, with the reason.
func TestRound12RemovedAccountSocketClosesFast(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	sock := joinLive(t, w.app, w.seller)[0]

	// A stranger cannot remove anyone.
	tradeWant(t, "stranger remove", w.buyer.c.Do("DELETE", "/api/admin/users/"+w.seller.id, nil), 403)

	started := time.Now()

	tradeWant(t, "remove", admin.c.Do("DELETE", "/api/admin/users/"+w.seller.id, nil), 200)

	if reason := closeReason(t, sock); reason != "account-removed" {
		t.Fatalf("close reason = %q, want account-removed", reason)
	}

	if took := time.Since(started); took > 2*time.Second {
		t.Fatalf("the socket took %s to close", took)
	}
}

// HA2: a role change reaches the person at once. A guest holds a socket that
// hears only about their own account; a promoted user starts hearing admin
// events and a demoted admin stops, with no wait for the 30 second recheck.
func TestRound12RoleChangeIsLive(t *testing.T) {
	w := newLiveWorld(t)
	guest, guestID := newGuest(t, w.app)
	promoted := tradeNewUser(t, w.app, "business")
	demoted := tradeNewUser(t, w.app, "admin")

	guestSock, _, err := dial(t, w.app, guest, testutil.WebOrigin)
	if err != nil {
		t.Fatalf("guest socket: %v", err)
	}

	socks := joinLive(t, w.app, promoted, demoted, w.admin)
	rising, falling, barrier := socks[0], socks[1], socks[2]

	// A group event never reaches the guest.
	rename := func() {
		tradeExec(t, w.app, `UPDATE users SET name = md5(random()::text) WHERE id = $1`, w.stranger.id)
	}

	rename()
	barrier.hear("user", w.stranger.id)
	guestSock.quiet("guest after a group event")

	// Only an admin may change a role.
	for name, caller := range map[string]tradeUser{"stranger": w.stranger, "seller": w.seller} {
		tradeWant(t, name+" role", caller.c.Do("PATCH", "/api/admin/users/"+guestID+"/role",
			map[string]any{"role": "collector"}), 403)
	}

	started := time.Now()

	tradeWant(t, "promote guest", w.admin.c.Do("PATCH", "/api/admin/users/"+guestID+"/role",
		map[string]any{"role": "collector"}), 200)
	guestSock.hear("user", guestID)

	if took := time.Since(started); took > 5*time.Second {
		t.Fatalf("the guest heard after %s", took)
	}

	tradeWant(t, "promote", w.admin.c.Do("PATCH", "/api/admin/users/"+promoted.id+"/role",
		map[string]any{"role": "admin"}), 200)
	tradeWant(t, "demote", w.admin.c.Do("PATCH", "/api/admin/users/"+demoted.id+"/role",
		map[string]any{"role": "business"}), 200)
	rising.hear("user", promoted.id)
	falling.hear("user", demoted.id)

	// No Recheck call: the change itself already moved both sockets.
	rename()
	barrier.hear("user", w.stranger.id)
	rising.hear("user", w.stranger.id)
	falling.quiet("demoted admin")
}

// SN1: a bank payout needs a six digit branch code; no payout needs none.
func TestRound12CollectorBranchCode(t *testing.T) {
	app := testutil.Server(t)
	owner, _ := domainUser(t, app, "business")

	for i, branch := range []string{"12", "ab!", "12345", "1234567", "12 456"} {
		body := collectorBody(domainPhone())
		body["email"] = "branch" + strconv.Itoa(i) + "@example.test"
		body["bank_branch_code"] = branch

		res := status(t, owner.Do("POST", "/api/collectors", body), 400)

		fields, _ := res.Body["fields"].(map[string]any)
		if fields["bank_branch_code"] != "Enter a 6-digit branch code." {
			t.Fatalf("branch %q: %s", branch, res.Raw)
		}
	}

	status(t, owner.Do("POST", "/api/collectors", collectorBody(domainPhone())), 200)

	blank := map[string]any{"name": "No Payout", "phone": domainPhone()}
	status(t, owner.Do("POST", "/api/collectors", blank), 200)
}

// SN2: a collection that would be stored as R 0.00 is refused and writes nothing.
func TestRound12CollectionTotalAtLeastOneCent(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000077")
	count := func() string {
		return tradeText(t, w.app, `SELECT (SELECT count(*) FROM transactions)::text || ':' ||
			(SELECT count(*) FROM transaction_items)::text`)
	}
	before := count()

	res := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "0.01", "0.10"))), 400)

	fields, _ := res.Body["fields"].(map[string]any)
	if fields["items"] != "The total must be at least R 0.01." {
		t.Fatalf("sub-cent collection: %s", res.Raw)
	}

	if count() != before {
		t.Fatal("a refused collection wrote rows")
	}

	// Two lines that each round down are still refused; one that rounds up passes.
	status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "0.01", "0.40"))), 400)

	id := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "0.01", "0.50"))), 200).Body["transaction_id"].(string)

	if got := tradeText(t, w.app, `SELECT total_price::text FROM transactions WHERE id = $1`, id); got != "0.01" {
		t.Fatalf("total = %s, want 0.01", got)
	}

	// Someone who is not a business or staff cannot record one, and nothing is written.
	stranger, _ := domainUser(t, w.app, "collector")
	after := count()
	status(t, stranger.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "5", "5"))), 403)

	if count() != after {
		t.Fatal("a stranger's collection wrote rows")
	}
}

// SN3: partial local and international phone searches find the same collector.
func TestRound12CollectorPhonePartialSearch(t *testing.T) {
	app := testutil.Server(t)
	creator, _ := domainUser(t, app, "business")
	other, _ := domainUnverified(t, app)
	stranger, _ := domainUser(t, app, "collector")

	body := collectorBody("0827771234")
	id := status(t, creator.Do("POST", "/api/collectors", body), 200).Body["id"]

	for _, query := range []string{"+27 82 777", "082 777", "0827771", "27827771", "7771234", "Collector A"} {
		res := status(t, creator.Do("GET", "/api/collectors?q="+url.QueryEscape(query), nil), 200)

		rows := pageItems(t, res)
		if len(rows) != 1 || rows[0]["id"] != id || res.Body["total"] != float64(1) {
			t.Fatalf("search %q: %s", query, res.Raw)
		}
	}

	// Digits that match nothing find nothing, and the count agrees.
	res := status(t, creator.Do("GET", "/api/collectors?q="+url.QueryEscape("+27 83 999"), nil), 200)
	if len(pageItems(t, res)) != 0 || res.Body["total"] != float64(0) {
		t.Fatalf("no-match search: %s", res.Raw)
	}

	// Another business finds the row but never its phone; a collector login is refused.
	rows := pageItems(t, status(t, other.Do("GET", "/api/collectors?q=082%20777", nil), 200))
	if len(rows) != 1 || rows[0]["phone"] != nil || rows[0]["email"] != nil {
		t.Fatalf("another business saw contact details: %v", rows)
	}

	status(t, stranger.Do("GET", "/api/collectors?q=082%20777", nil), 403)
}

// SN4: the directory says whether the reader may see the payout, so the page
// can tell "none added" from "not shared".
func TestRound12CollectorCanViewPayout(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	stranger, _ := domainUser(t, w.app, "collector")
	tradeUnverify(t, w.app, w.seller)
	id := privacyCollector(t, w.buyer.c)

	for name, c := range map[string]*testutil.Client{
		"creator": w.buyer.c, "admin": admin.c, "staff": staff.c, "other business": w.seller.c,
	} {
		want := name == "creator" || name == "admin"

		detail := status(t, c.Do("GET", "/api/collectors/"+id, nil), 200).Body
		if detail["can_view_payout"] != want {
			t.Errorf("%s detail: can_view_payout = %v, want %v", name, detail["can_view_payout"], want)
		}

		for _, row := range pageItems(t, status(t, c.Do("GET", "/api/collectors", nil), 200)) {
			if row["id"] == id && row["can_view_payout"] != want {
				t.Errorf("%s list: can_view_payout = %v, want %v", name, row["can_view_payout"], want)
			}
		}
	}

	// A collector login is refused the directory.
	status(t, stranger.Do("GET", "/api/collectors", nil), 403)
}

// SN5: the two duplicate messages read alike, each on its own field.
func TestRound12CollectorDuplicateWording(t *testing.T) {
	app := testutil.Server(t)
	owner, _ := domainUser(t, app, "business")
	other, _ := domainUnverified(t, app)

	first := collectorBody("0831110001")
	status(t, owner.Do("POST", "/api/collectors", first), 200)

	sameEmail := collectorBody("0831110002")
	res := status(t, owner.Do("POST", "/api/collectors", sameEmail), 409)

	fields, _ := res.Body["fields"].(map[string]any)
	if res.Body["message"] != "A collector with that email address already exists." ||
		fields["email"] != "A collector with that email address already exists." {
		t.Fatalf("email duplicate: %s", res.Raw)
	}

	samePhone := collectorBody("0831110001")
	samePhone["email"] = "someone@example.test"

	res = status(t, other.Do("POST", "/api/collectors", samePhone), 409)
	if res.Body["message"] != "A collector with that phone number already exists." {
		t.Fatalf("phone duplicate: %s", res.Raw)
	}
}

// HA4 and SN6: a collector reading their own record gets it whole and leaves no
// admin audit line; saving their profile keeps the payout.
func TestRound12CollectorOwnPayout(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	login := tradeNewUser(t, w.app, "collector")
	stranger := tradeNewUser(t, w.app, "collector")
	id := status(t, w.buyer.c.Do("POST", "/api/collectors", collectorBody(login.phone)), 200).Body["id"].(string)

	own := status(t, login.c.Do("GET", "/api/collectors/"+id, nil), 200).Body
	if own["bank_account_number"] != "123456789" || own["can_view_payout"] != true {
		t.Fatalf("own record: %v", own)
	}

	if slices.Contains(privacyKinds(t, admin, id), "admin_full_view") {
		t.Error("the owner's own read left an admin audit line")
	}

	other := status(t, stranger.c.Do("GET", "/api/collectors/"+id, nil), 200).Body
	if other["bank_account_number"] == "123456789" || other["can_view_payout"] != false {
		t.Fatalf("a stranger saw the account number: %v", other)
	}

	// The signed-in collector's own profile shows the whole number, and a save
	// of something else, or of the number as read, never erases it.
	status(t, login.c.Do("PATCH", "/api/profile", map[string]any{
		"bank_account_holder_name": "Holder", "bank_name": "Bank", "bank_account_number": "62001234567",
		"bank_branch_code": "250655", "bank_account_type": "Savings",
	}), 200)
	status(t, login.c.Do("PATCH", "/api/profile", map[string]any{"city": "Paarl"}), 200)

	got := status(t, login.c.Do("GET", "/api/profile", nil), 200).Body
	if got["bank_account_number"] != "•••• 4567" {
		t.Fatalf("own profile payout: %v", got)
	}

	status(t, login.c.Do("PATCH", "/api/profile", map[string]any{"bank_account_number": got["bank_account_number"]}), 200)

	if again := status(t, login.c.Do("GET", "/api/profile", nil), 200).Body; again["bank_account_number"] != "•••• 4567" {
		t.Fatalf("a save erased the payout: %v", again)
	}

	if mine := status(t, stranger.c.Do("GET", "/api/profile", nil), 200).Body; mine["bank_account_number"] == "62001234567" {
		t.Fatalf("a stranger's profile holds another person's number: %v", mine)
	}
}
