package tests

import (
	"strings"
	"sync"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

const (
	changesAPI = "/api/admin/collector-changes"
	newAccount = "555566667777"
)

// changeWorld is a collector made by one business, and a second business that
// wants to edit it.
type changeWorld struct {
	app        *testutil.App
	creator    *testutil.Client
	creatorID  string
	other      *testutil.Client
	otherID    string
	staff      *testutil.Client
	staffID    string
	admin      *testutil.Client
	collector  string
	collectors string
}

func newChangeWorld(t *testing.T) changeWorld {
	t.Helper()

	app := testutil.Server(t)
	creator, creatorID := domainUser(t, app, "business")
	other, otherID := domainUnverified(t, app)
	staff, staffID := domainUser(t, app, "staff")
	admin, _ := domainUser(t, app, "admin")
	id := status(t, creator.Do("POST", "/api/collectors", collectorBody(domainPhone())), 200).Body["id"].(string)

	return changeWorld{
		app: app, creator: creator, creatorID: creatorID, other: other, otherID: otherID,
		staff: staff, staffID: staffID, admin: admin, collector: id, collectors: "/api/collectors/" + id,
	}
}

// propose sends an edit as the other business and returns the waiting change id.
func (w changeWorld) propose(t *testing.T, body map[string]any) string {
	t.Helper()

	response := status(t, w.other.Do("PATCH", w.collectors, body), 202)
	if response.Body["pending"] != true || response.Body["message"] == "" {
		t.Fatalf("proposal answer: %s", response.Raw)
	}

	return w.pendingID(t, w.otherID)
}

func (w changeWorld) pendingID(t *testing.T, business string) string {
	t.Helper()

	return tradeText(t, w.app, `SELECT COALESCE(max(id),'') FROM collector_changes
		WHERE collector_id=$1 AND business_id=$2 AND status='pending'`, w.collector, business)
}

func (w changeWorld) field(t *testing.T, column string) string {
	t.Helper()

	return tradeText(t, w.app, `SELECT COALESCE(`+column+`::text,'') FROM collectors WHERE id=$1`, w.collector)
}

func TestCollectorChangeIsKeptSealedAndNotApplied(t *testing.T) {
	w := newChangeWorld(t)
	manager := tenantMember(t, w.app, w.otherID, "manager")
	member := tenantMember(t, w.app, w.otherID, "member")

	id := func() string {
		w.propose(t, map[string]any{"name": "Owner edit"})

		return w.propose(t, map[string]any{
			"name": "Proposed Name", "bank_name": "Proposed Bank", "bank_account_number": newAccount,
		})
	}()

	// The live collector keeps its old values.
	if w.field(t, "name") != "Collector A" || w.field(t, "bank_name") != "Bank" {
		t.Fatal("a proposal changed the live collector")
	}

	// The payout number is sealed, with its last four beside it; nothing is plain.
	row := tradeText(t, w.app, `SELECT concat_ws('|', name, bank_name, bank_account_number,
		bank_account_last4, COALESCE(email,'none')) FROM collector_changes WHERE id=$1`, id)
	if strings.Contains(row, newAccount) || !strings.Contains(row, "|v1:") ||
		!strings.Contains(row, "|7777|none") {
		t.Fatalf("stored proposal: %s", row)
	}

	// An untouched field stays out of the change.
	if tradeText(t, w.app, `SELECT (email IS NULL AND city IS NULL)::text FROM collector_changes WHERE id=$1`, id) != "true" {
		t.Fatal("a field that was not edited was stored")
	}

	// A Manager of the same business proposes too; a Member cannot edit at all.
	status(t, manager.c.Do("PATCH", w.collectors, map[string]any{"city": "Paarl"}), 202)
	status(t, member.c.Do("PATCH", w.collectors, map[string]any{"city": "Nope"}), 403)

	// The log never holds the plain number.
	leak := tradeText(t, w.app, `SELECT count(*) FROM audit_log WHERE new_values::text LIKE '%'||$1||'%'
		OR old_values::text LIKE '%'||$1||'%'`, newAccount)
	if leak != "0" {
		t.Fatalf("the proposed payout number reached the audit log in plain text: %s", leak)
	}
}

func TestCollectorEditsAppliedAtOnceByCreatorStaffAndAdmin(t *testing.T) {
	w := newChangeWorld(t)

	for name, client := range map[string]*testutil.Client{"creator": w.creator, "staff": w.staff, "admin": w.admin} {
		response := status(t, client.Do("PATCH", w.collectors, map[string]any{
			"name": "By " + name, "bank_name": "Bank of " + name,
		}), 200)
		if response.Body["pending"] != nil {
			t.Fatalf("%s: edit was held back: %s", name, response.Raw)
		}

		if w.field(t, "name") != "By "+name || w.field(t, "bank_name") != "Bank of "+name {
			t.Fatalf("%s: edit not applied", name)
		}
	}

	if tradeText(t, w.app, `SELECT count(*) FROM collector_changes`) != "0" {
		t.Fatal("an immediate edit left a waiting change")
	}
}

func TestCollectorChangeNoChangeAndBadInputStoreNothing(t *testing.T) {
	w := newChangeWorld(t)

	// Saving what is already there has nothing to approve.
	status(t, w.other.Do("PATCH", w.collectors, map[string]any{"name": "Collector A"}), 200)
	// Bad input is refused up front, like a direct edit.
	status(t, w.other.Do("PATCH", w.collectors, map[string]any{"email": "not-an-email"}), 400)
	status(t, w.other.Do("PATCH", w.collectors, map[string]any{"bank_branch_code": "12"}), 400)

	if tradeText(t, w.app, `SELECT count(*) FROM collector_changes`) != "0" {
		t.Fatal("an empty or invalid edit was stored")
	}
}

func TestCollectorChangeQueueIsStaffOnly(t *testing.T) {
	w := newChangeWorld(t)
	third, thirdID := domainUnverified(t, w.app)
	id := w.propose(t, map[string]any{"name": "Seen By Staff", "bank_account_number": newAccount})

	// No business can list, approve or reject, not even the proposer or creator.
	for name, client := range map[string]*testutil.Client{"proposer": w.other, "creator": w.creator, "third": third} {
		status(t, client.Do("GET", changesAPI, nil), 403)
		status(t, client.Do("POST", changesAPI+"/"+id+"/approve", map[string]any{}), 403)
		status(t, client.Do("POST", changesAPI+"/"+id+"/reject", map[string]any{"reason": name}), 403)
	}

	if tradeText(t, w.app, `SELECT status FROM collector_changes WHERE id=$1`, id) != "pending" ||
		w.field(t, "name") != "Collector A" {
		t.Fatal("a business resolved a change")
	}

	// Staff and admin see it, with payout numbers masked and old against new.
	for name, client := range map[string]*testutil.Client{"staff": w.staff, "admin": w.admin} {
		response := status(t, client.Do("GET", changesAPI, nil), 200)
		if strings.Contains(string(response.Raw), newAccount) {
			t.Fatalf("%s saw a whole payout number: %s", name, response.Raw)
		}

		items := tradeItems(response)
		if len(items) != 1 {
			t.Fatalf("%s queue: %s", name, response.Raw)
		}

		item := items[0].(map[string]any)
		if item["id"] != id || item["collector_name"] != "Collector A" || item["business_name"] == "" {
			t.Fatalf("%s queue item: %s", name, response.Raw)
		}

		seen := map[string]map[string]any{}
		for _, line := range item["changes"].([]any) {
			field := line.(map[string]any)
			seen[field["field"].(string)] = field
		}

		if seen["name"]["old"] != "Collector A" || seen["name"]["new"] != "Seen By Staff" ||
			seen["bank_account_number"]["new"] != "•••• 7777" || seen["bank_account_number"]["secret"] != true ||
			seen["bank_account_number"]["old"] != "•••• 6789" || len(seen) != 2 {
			t.Fatalf("%s change lines: %v", name, seen)
		}
	}

	// Each business sees a pending mark on its own change only.
	pending := func(client *testutil.Client) any {
		return status(t, client.Do("GET", w.collectors, nil), 200).Body["pending_change"]
	}

	if pending(w.other) != true || pending(third) != false || pending(w.creator) != false {
		t.Fatal("the pending mark leaked to another business")
	}

	list := pageItems(t, status(t, w.other.Do("GET", "/api/collectors", nil), 200))
	if len(list) != 1 || list[0]["pending_change"] != true {
		t.Fatalf("list mark: %v", list)
	}

	_ = thirdID
}

func TestCollectorChangeApprovedApplies(t *testing.T) {
	w := newChangeWorld(t)
	id := w.propose(t, map[string]any{
		"name": "Approved Name", "bank_name": "Approved Bank", "bank_account_number": newAccount,
	})

	status(t, w.staff.Do("POST", changesAPI+"/"+id+"/approve", map[string]any{}), 200)

	if w.field(t, "name") != "Approved Name" || w.field(t, "bank_name") != "Approved Bank" {
		t.Fatal("approval did not apply the fields")
	}

	// The creator opens the collector and reads the new number whole: it went
	// through the normal sealing, not as the proposal's text.
	if got := status(t, w.creator.Do("GET", w.collectors, nil), 200).Body["bank_account_number"]; got != newAccount {
		t.Fatalf("approved account number: %v", got)
	}

	if tradeText(t, w.app, `SELECT concat_ws('|', status, resolved_by, reason) FROM collector_changes WHERE id=$1`, id) !=
		"approved|"+w.staffID+"|" {
		t.Fatal("approval not recorded against the reviewer")
	}

	// The log names the person who proposed, and the person who approved.
	proposed := auditLines(t, w.app, "collector_changes", "id", id)
	if len(proposed) != 2 || proposed[0].Action != "insert" || proposed[0].Actor != w.otherID ||
		proposed[1].Action != "update" || proposed[1].Actor != w.staffID || proposed[1].New["status"] != "approved" {
		t.Fatalf("change audit lines: %+v", proposed)
	}

	var applied bool

	for _, line := range auditLines(t, w.app, "collectors", "id", w.collector) {
		if line.New["name"] == "Approved Name" {
			applied = line.Actor == w.staffID

			if line.New["bank_account_number"] != nil && line.New["bank_account_number"] != "••••" &&
				line.New["bank_account_number"] != "•••• 7777" {
				t.Fatalf("collector audit line shows a payout number: %v", line.New)
			}
		}
	}

	if !applied {
		t.Fatal("the collector update was not logged under the approving staff member")
	}

	// The proposing business is told; the creating business is not.
	if tradeText(t, w.app, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='collector_change'
		AND title='Collector change approved'`, w.otherID) != "1" ||
		tradeText(t, w.app, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='collector_change'`, w.creatorID) != "0" {
		t.Fatal("outcome notice went to the wrong people")
	}

	// The mark clears once it is decided.
	if status(t, w.other.Do("GET", w.collectors, nil), 200).Body["pending_change"] != false {
		t.Fatal("pending mark stayed after approval")
	}
}

func TestCollectorChangeRejectedLeavesCollector(t *testing.T) {
	w := newChangeWorld(t)
	manager := tenantMember(t, w.app, w.otherID, "manager")
	id := w.propose(t, map[string]any{"name": "Rejected Name", "bank_name": "Rejected Bank"})

	status(t, w.admin.Do("POST", changesAPI+"/"+id+"/reject", map[string]any{"reason": "Wrong bank"}), 200)

	if w.field(t, "name") != "Collector A" || w.field(t, "bank_name") != "Bank" {
		t.Fatal("a rejected change touched the collector")
	}

	if tradeText(t, w.app, `SELECT concat_ws('|', status, reason) FROM collector_changes WHERE id=$1`, id) != "rejected|Wrong bank" {
		t.Fatal("rejection reason not stored")
	}

	// Owners and Managers of the proposing business hear it, with the reason.
	for _, person := range []string{w.otherID, manager.id} {
		body := tradeText(t, w.app, `SELECT COALESCE(max(body),'') FROM notifications
			WHERE user_id=$1 AND type='collector_change' AND title='Collector change not approved'`, person)
		if !strings.Contains(body, "Collector A") || !strings.Contains(body, "Reason: Wrong bank") {
			t.Fatalf("rejection notice for %s: %q", person, body)
		}
	}

	// A rejection needs no reason, and a long one is refused.
	again := w.propose(t, map[string]any{"city": "Paarl"})
	status(t, w.staff.Do("POST", changesAPI+"/"+again+"/reject", map[string]any{"reason": strings.Repeat("x", 501)}), 400)
	status(t, w.staff.Do("POST", changesAPI+"/"+again+"/reject", map[string]any{}), 200)
}

func TestCollectorChangeResolvesOnce(t *testing.T) {
	w := newChangeWorld(t)
	second := tradeNewUser(t, w.app, "staff")
	id := w.propose(t, map[string]any{"name": "Race Name"})

	// Two reviewers at the very same moment: one wins, the other is told it is done.
	var wait sync.WaitGroup

	codes := make([]int, 2)

	for i, client := range []*testutil.Client{w.staff, second.c} {
		wait.Add(1)

		go func() {
			defer wait.Done()

			codes[i] = client.Do("POST", changesAPI+"/"+id+"/approve", map[string]any{}).Status
		}()
	}

	wait.Wait()

	if !(codes[0] == 200 && codes[1] == 409) && !(codes[0] == 409 && codes[1] == 200) {
		t.Fatalf("two reviewers got %v", codes)
	}

	status(t, w.staff.Do("POST", changesAPI+"/"+id+"/approve", map[string]any{}), 409)
	status(t, w.admin.Do("POST", changesAPI+"/"+id+"/reject", map[string]any{}), 409)
	status(t, w.staff.Do("POST", changesAPI+"/nobody/approve", map[string]any{}), 404)

	if tradeText(t, w.app, `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='collector_change'`, w.otherID) != "1" {
		t.Fatal("a change was announced more than once")
	}
}

func TestCollectorChangeReplacesTheBusinessesOldOne(t *testing.T) {
	w := newChangeWorld(t)
	third, thirdID := domainUnverified(t, w.app)

	first := w.propose(t, map[string]any{"name": "First Try"})
	second := w.propose(t, map[string]any{"name": "Second Try"})
	status(t, third.Do("PATCH", w.collectors, map[string]any{"name": "Third Business"}), 202)

	if first == second {
		t.Fatal("the new proposal reused the old row")
	}

	if tradeText(t, w.app, `SELECT status FROM collector_changes WHERE id=$1`, first) != "replaced" ||
		tradeText(t, w.app, `SELECT name FROM collector_changes WHERE id=$1`, second) != "Second Try" {
		t.Fatal("the old proposal was not replaced")
	}

	// One waiting change per business, so the queue holds two.
	queue := tradeItems(status(t, w.staff.Do("GET", changesAPI, nil), 200))
	if len(queue) != 2 || w.pendingID(t, thirdID) == "" {
		t.Fatalf("queue after a replace: %d items", len(queue))
	}

	// Approving one does not resolve the other business's.
	status(t, w.staff.Do("POST", changesAPI+"/"+second+"/approve", map[string]any{}), 200)

	if w.field(t, "name") != "Second Try" || w.pendingID(t, thirdID) == "" {
		t.Fatal("approving one change disturbed the other")
	}

	// The replaced one can no longer be approved.
	status(t, w.staff.Do("POST", changesAPI+"/"+first+"/approve", map[string]any{}), 409)
}

func TestCollectorChangeApprovalChecksTheCollectorAgain(t *testing.T) {
	w := newChangeWorld(t)
	id := w.propose(t, map[string]any{"email": "taken@example.test"})

	// Another collector of the creating business takes the email meanwhile.
	body := collectorBody(domainPhone())
	body["email"] = "taken@example.test"
	status(t, w.creator.Do("POST", "/api/collectors", body), 200)

	status(t, w.staff.Do("POST", changesAPI+"/"+id+"/approve", map[string]any{}), 409)

	if tradeText(t, w.app, `SELECT status FROM collector_changes WHERE id=$1`, id) != "pending" ||
		w.field(t, "email") != "collector@example.test" {
		t.Fatal("a failed approval changed something")
	}
}

func TestCollectorChangeSwitchingPayoutMethodAndClearing(t *testing.T) {
	w := newChangeWorld(t)

	id := w.propose(t, map[string]any{
		"payout_method": "ewallet", "ewallet_platform_name": "Wallet", "ewallet_payment_id": "0821234567",
	})
	status(t, w.staff.Do("POST", changesAPI+"/"+id+"/approve", map[string]any{}), 200)

	if w.field(t, "payout_method") != "ewallet" || w.field(t, "bank_name") != "" ||
		status(t, w.creator.Do("GET", w.collectors, nil), 200).Body["ewallet_payment_id"] != "0821234567" {
		t.Fatal("switching to an e-wallet was not applied as a normal save")
	}

	// Choosing no payout comes through approval as a real clear.
	none := w.propose(t, map[string]any{"payout_method": "none"})
	status(t, w.staff.Do("POST", changesAPI+"/"+none+"/approve", map[string]any{}), 200)

	if w.field(t, "payout_method") != "" || w.field(t, "ewallet_payment_id") != "" {
		t.Fatal("clearing the payout was not applied")
	}
}
