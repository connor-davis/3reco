package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// payoutState reads the stored payout columns of one collector as plain text.
func payoutState(t *testing.T, app *testutil.App, id string) string {
	t.Helper()

	return tradeText(t, app, `SELECT concat_ws('|', COALESCE(payout_method,''), COALESCE(bank_name,''),
		COALESCE(bank_account_holder_name,''), COALESCE(bank_account_type,''), COALESCE(name,''))
		FROM collectors WHERE id=$1`, id)
}

func TestSharedCollectorsEditMatrix(t *testing.T) {
	app := testutil.Server(t)
	creator, creatorID := domainUser(t, app, "business")
	otherOwner, otherID := domainUnverified(t, app)
	otherManager := tenantMember(t, app, otherID, "manager")
	creatorManager := tenantMember(t, app, creatorID, "manager")
	creatorMember := tenantMember(t, app, creatorID, "member")
	staff, _ := domainUser(t, app, "staff")
	admin, _ := domainUser(t, app, "admin")
	id := status(t, creator.Do("POST", "/api/collectors", collectorBody(domainPhone())), 200).Body["id"].(string)
	path := "/api/collectors/" + id

	// Ordinary fields: the creating business applies at once; another business
	// only proposes (202, nothing changes yet); a Member never edits.
	for _, c := range []struct {
		name   string
		client *testutil.Client
		want   int
	}{
		{"other owner", otherOwner, 202},
		{"other manager", otherManager.c, 202},
		{"creator manager", creatorManager.c, 200},
		{"creator member", creatorMember.c, 403},
	} {
		body := map[string]any{"name": "By " + c.name, "phone": domainPhone(), "street_address": "1 New Road"}
		status(t, c.client.Do("PATCH", path, body), c.want)

		if got := tradeText(t, app, `SELECT name FROM collectors WHERE id=$1`, id); (got == "By "+c.name) != (c.want == 200) {
			t.Fatalf("%s: name in the database is %q", c.name, got)
		}
	}

	// Payout: another business only proposes, so the row does not change.
	before := payoutState(t, app, id)

	for _, field := range []map[string]any{
		{"bank_name": "Evil Bank"},
		{"bank_account_holder_name": "Evil"},
		{"bank_account_type": "Cheque"},
		{"bank_account_number": "999999999"},
		{"bank_branch_code": "999999"},
	} {
		for _, c := range []struct {
			name   string
			client *testutil.Client
			want   int
		}{
			{"other owner", otherOwner, 202},
			{"other manager", otherManager.c, 202},
			{"creator member", creatorMember.c, 403},
		} {
			if res := c.client.Do("PATCH", path, field); res.Status != c.want {
				t.Fatalf("%s payout %v: status %d", c.name, field, res.Status)
			}
		}
	}

	if got := payoutState(t, app, id); got != before {
		t.Fatalf("a proposed payout write changed the row: %q -> %q", before, got)
	}

	// An unchanged mask, or a repeated value, is not a change.
	view := status(t, otherOwner.Do("GET", path, nil), 200).Body
	if view["can_edit"] != true || view["can_edit_payout"] != true || view["bank_account_number"] != "•••• 6789" {
		t.Fatalf("other business view: %v", view)
	}

	status(t, otherOwner.Do("PATCH", path, map[string]any{
		"bank_account_number": view["bank_account_number"], "bank_branch_code": view["bank_branch_code"],
		"bank_name": view["bank_name"], "city": "Paarl",
	}), 202)

	// The creator's Manager, the creator's Owner, staff and admin may change it.
	for name, client := range map[string]*testutil.Client{"creator manager": creatorManager.c, "creator": creator, "staff": staff, "admin": admin} {
		status(t, client.Do("PATCH", path, map[string]any{"bank_name": "Bank of " + name}), 200)

		if got := tradeText(t, app, `SELECT bank_name FROM collectors WHERE id=$1`, id); got != "Bank of "+name {
			t.Fatalf("%s payout change not stored: %q", name, got)
		}
	}

	// Another business never learns the whole payout, before or after.
	if got := status(t, otherOwner.Do("GET", path, nil), 200).Body["bank_account_number"]; got == "123456789" {
		t.Fatal("another business read the whole account number")
	}
}

func TestSharedCollectorsAuditNamesTheActor(t *testing.T) {
	app := testutil.Server(t)
	creator, creatorID := domainUser(t, app, "business")
	otherOwner, otherID := domainUnverified(t, app)
	id := status(t, creator.Do("POST", "/api/collectors", collectorBody(domainPhone())), 200).Body["id"].(string)

	// Another business only proposes, so its edit is not a collectors line;
	// the proposal is logged on its own table with that business as actor.
	status(t, otherOwner.Do("PATCH", "/api/collectors/"+id, map[string]any{"city": "Paarl"}), 202)
	status(t, creator.Do("PATCH", "/api/collectors/"+id, map[string]any{"bank_name": "Audited Bank"}), 200)
	status(t, otherOwner.Do("PATCH", "/api/collectors/"+id, map[string]any{"bank_name": "Refused"}), 202)

	var bank bool

	for _, line := range auditLines(t, app, "collectors", "id", id) {
		if line.Action != "UPDATE" && line.Action != "update" {
			continue
		}

		switch {
		case line.New["city"] == "Paarl" || line.New["bank_name"] == "Refused":
			t.Fatal("a proposed edit reached the collector's audit log before approval")
		case line.New["bank_name"] == "Audited Bank":
			bank = line.Actor == creatorID
		}
	}

	if !bank {
		t.Fatal("the creator's payout edit was not logged under the creator")
	}

	proposals := tradeText(t, app, `SELECT count(*) FROM audit_log WHERE table_name='collector_changes'
		AND action='insert' AND actor_id=$1`, otherID)
	if proposals != "2" {
		t.Fatalf("proposals logged under the other business: %s", proposals)
	}
}
