package tests

import (
	"context"
	"testing"

	"github.com/connor-davis/3reco/internal/services/realtime"
	"github.com/connor-davis/3reco/tests/testutil"
)

func TestRemovedMemberLosesAccessAndSocket(t *testing.T) {
	w := newTradeWorld(t)
	tradeExec(t, w.app, `UPDATE stock SET is_listed=false WHERE id=$1`, w.stock)
	member := tenantMember(t, w.app, w.seller.id, "manager")
	sock := joinLive(t, w.app, member)[0]
	status(t, w.seller.c.Do("DELETE", "/api/team/members/"+member.id, nil), 200)
	if code := closeCode(t, sock); code != realtime.CloseMembershipEnded || code == 4401 {
		t.Fatalf("membership removal close code = %d", code)
	}
	status(t, member.c.Do("GET", "/api/auth/me", nil), 200)
	status(t, member.c.Do("GET", "/api/stock/"+w.stock, nil), 404)
	if active := tradeText(t, w.app, `SELECT active_business_id FROM sessions WHERE user_id=$1`, member.id); active != "" {
		t.Fatalf("removed person's session still selects %q", active)
	}
}

func TestRemovedMemberFallsBackToOtherBusiness(t *testing.T) {
	w := newTradeWorld(t)
	tradeExec(t, w.app, `UPDATE stock SET is_listed=false WHERE id=$1`, w.stock)
	member := tenantMember(t, w.app, w.seller.id, "member")
	tradeExec(t, w.app, `INSERT INTO business_members VALUES($1,$2,'manager')`, w.buyer.id, member.id)
	status(t, w.seller.c.Do("DELETE", "/api/team/members/"+member.id, nil), 200)
	if active := tradeText(t, w.app, `SELECT active_business_id FROM sessions WHERE user_id=$1`, member.id); active != "" {
		t.Fatal("removal did not clear selection in its transaction")
	}
	me := status(t, member.c.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if me["active_business_id"] != w.buyer.id || me["business_role"] != "manager" {
		t.Fatalf("remaining business was not selected: %v", me)
	}
	status(t, member.c.Do("GET", "/api/stock/"+w.stock, nil), 404)
}

func hearResync(t *testing.T, sock *socket) {
	t.Helper()

	for range 20 {
		if sock.next()["type"] == "resync" {
			return
		}
	}
	t.Fatal("role change did not send resync")
}

func TestRoleChangeIsLive(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "member")
	sock := joinLive(t, w.app, member)[0]
	body := map[string]any{"items": []any{}}
	path := "/api/cart?seller_id=" + w.buyer.id
	status(t, member.c.Do("PUT", path, body), 403)
	status(t, w.seller.c.Do("PATCH", "/api/team/members/"+member.id, map[string]any{"role": "manager"}), 200)
	hearResync(t, sock)
	status(t, member.c.Do("PUT", path, body), 200)
	settle(t, w.app, sock)
	status(t, w.seller.c.Do("PATCH", "/api/team/members/"+member.id, map[string]any{"role": "member"}), 200)
	hearResync(t, sock)
	status(t, member.c.Do("PUT", path, body), 403)
	status(t, member.c.Do("GET", "/api/auth/me", nil), 200)
	status(t, member.c.Do("GET", "/api/team", nil), 403)
}

func TestTeamEventsLive(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "member")
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	socks := joinLive(t, w.app, w.seller, w.buyer, admin, staff)
	id, _ := teamInvite(t, w.app, w.seller, testutil.Email("live"), "member")
	socks[0].hear("team", w.seller.id)
	socks[1].quiet("another business")
	socks[2].quiet("unrelated admin")
	socks[3].quiet("unrelated staff")
	status(t, w.seller.c.Do("PATCH", "/api/team/members/"+member.id, map[string]any{"role": "manager"}), 200)
	socks[0].hear("team", w.seller.id)
	socks[1].quiet("another business")
	socks[2].quiet("unrelated admin")
	socks[3].quiet("unrelated staff")
	status(t, w.seller.c.Do("DELETE", "/api/team/members/"+member.id, nil), 200)
	socks[0].hear("team", w.seller.id)
	socks[1].quiet("another business")
	socks[2].quiet("unrelated admin")
	socks[3].quiet("unrelated staff")
	status(t, w.seller.c.Do("POST", "/api/team/invites/"+id+"/resend", nil), 200)
	socks[0].hear("team", w.seller.id)
	status(t, w.seller.c.Do("DELETE", "/api/team/invites/"+id, nil), 200)
	socks[0].hear("team", w.seller.id)
	socks[1].quiet("another business")
	socks[2].quiet("unrelated admin")
	socks[3].quiet("unrelated staff")
}

func TestTeamAuditScope(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")
	id, token := teamInvite(t, app, owner, other.email, "member")
	status(t, other.c.Do("POST", "/api/auth/invites/accept", map[string]any{"token": token}), 200)
	status(t, owner.c.Do("PATCH", "/api/team/members/"+other.id, map[string]any{"role": "manager"}), 200)
	status(t, owner.c.Do("DELETE", "/api/team/members/"+other.id, nil), 200)

	rows, err := app.DB.Pool.Query(context.Background(), `SELECT action,actor_id,business_id
		FROM audit_log WHERE table_name='business_members' AND row_key->>'business_id'=$1
		AND row_key->>'user_id'=$2 ORDER BY id`, owner.id, other.id)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var action, actor, business string
		if err := rows.Scan(&action, &actor, &business); err != nil {
			t.Fatal(err)
		}
		wantActor := owner.id
		if action == "insert" {
			wantActor = other.id
		}
		if actor != wantActor || business != owner.id {
			t.Fatalf("wrong audit scope: %s %s %s", action, actor, business)
		}
		count++
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if count != 3 {
		t.Fatalf("membership audit rows = %d", count)
	}
	lines := auditLines(t, app, "business_invites", "id", id)
	if len(lines) != 2 || lines[0].Actor != owner.id || lines[1].Actor != other.id {
		t.Fatalf("invite audit missing actors: %+v", lines)
	}
	for _, line := range lines {
		if _, ok := line.New["token_hash"]; ok {
			t.Fatal("invite audit contains token hash")
		}
		if _, ok := line.Old["token_hash"]; ok {
			t.Fatal("invite audit contains old token hash")
		}
	}
}
