package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func tenantMember(t *testing.T, app *testutil.App, businessID, role string) tradeUser {
	t.Helper()

	person := tradeNewUser(t, app, "collector")
	tradeExec(t, app, `INSERT INTO business_members VALUES ($1,$2,$3)`, businessID, person.id, role)
	tradeExec(t, app, `UPDATE sessions SET active_business_id=$2 WHERE user_id=$1`, person.id, businessID)

	return person
}

func TestBusinessSessionLoadsLiveMembership(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "manager")

	me := status(t, member.c.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if me["id"] != member.id || me["active_business_id"] != w.seller.id || me["business_role"] != "manager" {
		t.Fatalf("session mixed person and business: %v", me)
	}

	tradeExec(t, w.app, `UPDATE business_members SET role='member' WHERE business_id=$1 AND user_id=$2`, w.seller.id, member.id)
	me = status(t, member.c.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if me["business_role"] != "member" {
		t.Fatalf("a role change was cached: %v", me)
	}

	tradeExec(t, w.app, `DELETE FROM business_members WHERE business_id=$1 AND user_id=$2`, w.seller.id, member.id)
	me = status(t, member.c.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if me["active_business_id"] != "" || me["business_role"] != "" {
		t.Fatalf("a removed membership was cached: %v", me)
	}
}

func TestBusinessAuditKeepsPersonActorAndBusinessScope(t *testing.T) {
	w := newTradeWorld(t)

	status(t, w.seller.c.Do("PATCH", "/api/stock/"+w.stock, map[string]any{"price": "9"}), 200)
	if got := tradeText(t, w.app, `SELECT business_id FROM audit_log WHERE table_name='stock'
		AND row_key->>'id'=$1 AND actor_id=$2 ORDER BY id DESC LIMIT 1`, w.stock, w.seller.id); got != w.seller.id {
		t.Fatalf("business audit scope = %q", got)
	}

	tradeExec(t, w.app, `UPDATE stock SET price=10 WHERE id=$1`, w.stock)
	if got := tradeText(t, w.app, `SELECT business_id FROM audit_log WHERE table_name='stock'
		AND row_key->>'id'=$1 ORDER BY id DESC LIMIT 1`, w.stock); got != "" {
		t.Fatalf("business scope escaped its transaction: %q", got)
	}
}

func TestTenantBusinessSetupKeepsLiveSession(t *testing.T) {
	app := testutil.Server(t)
	client := app.NewClient(t)
	email := signUp(t, app, client, true)
	signIn(t, client, email, goodPassword)
	id := userID(t, client)
	sock, _, err := dial(t, app, client, testutil.WebOrigin)
	if err != nil {
		t.Fatal(err)
	}

	fillProfile(t, client, true)
	status(t, client.Do("POST", "/api/profile/setup", map[string]any{"role": "business"}), 200)
	sock.hear("user", id)

	material := tradeMaterial(t, app, "Setup stock", "1")
	stock := status(t, client.Do("POST", "/api/stock", map[string]any{
		"material_id": material, "weight": "10", "price": "2",
	}), 200).Body["id"].(string)
	sock.hear("stock", stock)
	status(t, client.Do("GET", "/api/auth/me", nil), 200)
}
