package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestTeamManagerMemberChanges(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	manager := tenantMember(t, app, owner.id, "manager")
	peer := tenantMember(t, app, owner.id, "manager")
	member := tenantMember(t, app, owner.id, "member")
	other := tradeNewUser(t, app, "business")
	outsider := tenantMember(t, app, other.id, "manager")

	view := status(t, manager.c.Do("GET", "/api/team", nil), 200)
	if len(view.Body["members"].([]any)) != 4 {
		t.Fatalf("manager directory = %v", view.Body)
	}
	foreign := status(t, outsider.c.Do("GET", "/api/team", nil), 200)
	if len(foreign.Body["members"].([]any)) != 2 {
		t.Fatalf("foreign directory = %v", foreign.Body)
	}

	for _, target := range []tradeUser{owner, manager, peer, member} {
		path := "/api/team/members/" + target.id
		status(t, member.c.Do("PATCH", path, map[string]any{"role": "manager"}), 403)
		status(t, member.c.Do("DELETE", path, nil), 403)
		status(t, outsider.c.Do("PATCH", path, map[string]any{"role": "manager"}), 404)
		status(t, outsider.c.Do("DELETE", path, nil), 404)
	}

	for _, target := range []tradeUser{owner, manager, peer} {
		path := "/api/team/members/" + target.id
		for _, role := range []string{"member", "manager", "owner"} {
			status(t, manager.c.Do("PATCH", path, map[string]any{"role": role}), 403)
		}
		status(t, manager.c.Do("DELETE", path, nil), 403)
	}

	path := "/api/team/members/" + member.id
	status(t, manager.c.Do("PATCH", path, map[string]any{"role": "owner"}), 403)
	status(t, manager.c.Do("PATCH", path, map[string]any{"role": "manager"}), 200)
	status(t, manager.c.Do("PATCH", path, map[string]any{"role": "member"}), 403)
	status(t, owner.c.Do("PATCH", path, map[string]any{"role": "member"}), 200)
	status(t, manager.c.Do("DELETE", path, nil), 200)
}

func TestTeamManagerInvitations(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	manager := tenantMember(t, app, owner.id, "manager")
	member := tenantMember(t, app, owner.id, "member")
	other := tradeNewUser(t, app, "business")
	outsider := tenantMember(t, app, other.id, "manager")

	for _, role := range []string{"member", "manager", "owner"} {
		t.Run(role, func(t *testing.T) {
			email := testutil.Email("manager-invite")
			body := map[string]any{"email": email, "role": role}
			status(t, member.c.Do("POST", "/api/team/invites", body), 403)
			want := 200
			if role == "owner" {
				want = 403
			}
			status(t, manager.c.Do("POST", "/api/team/invites", body), want)
			if role == "owner" {
				status(t, owner.c.Do("POST", "/api/team/invites", body), 200)
			}

			id := tradeText(t, app, `SELECT id FROM business_invites WHERE email=$1`, email)
			path := "/api/team/invites/" + id
			for _, action := range []struct{ method, suffix string }{
				{"POST", "/resend"}, {"DELETE", ""},
			} {
				status(t, member.c.Do(action.method, path+action.suffix, nil), 403)
				status(t, outsider.c.Do(action.method, path+action.suffix, nil), 404)
				status(t, manager.c.Do(action.method, path+action.suffix, nil), want)
			}
		})
	}

	// An invitation cannot choose a different tenant through its JSON body.
	email := testutil.Email("manager-scoped")
	status(t, outsider.c.Do("POST", "/api/team/invites", map[string]any{
		"email": email, "role": "member", "business_id": owner.id,
	}), 200)
	if got := tradeText(t, app, `SELECT business_id FROM business_invites WHERE email=$1`, email); got != other.id {
		t.Fatal("manager invited into another business")
	}
}

func TestTeamManagerChangeIsLive(t *testing.T) {
	w := newTradeWorld(t)
	manager := tenantMember(t, w.app, w.seller.id, "manager")
	member := tenantMember(t, w.app, w.seller.id, "member")
	sock := joinLive(t, w.app, manager)[0]

	status(t, manager.c.Do("PATCH", "/api/team/members/"+member.id, map[string]any{"role": "manager"}), 200)
	sock.hear("team", w.seller.id)
}
