package tests

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/tests/testutil"
)

func teamInvite(t *testing.T, app *testutil.App, owner tradeUser, email, role string) (string, string) {
	t.Helper()

	status(t, owner.c.Do("POST", "/api/team/invites", map[string]any{"email": email, "role": role}), 200)
	id := tradeText(t, app, `SELECT id FROM business_invites
		WHERE business_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL`, owner.id, email)

	return id, teamMailToken(t, app, id, email)
}

func teamMailToken(t *testing.T, app *testutil.App, id, email string) string {
	t.Helper()

	hash := tradeText(t, app, `SELECT token_hash FROM business_invites WHERE id=$1`, id)
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		token := testutil.WaitMail(t, email, "Join your 3rEco team").Token()
		if auth.HashToken(token) == hash {
			return token
		}

		time.Sleep(150 * time.Millisecond)
	}
	t.Fatal("current invitation mail did not arrive")

	return ""
}

func TestTeamMemberDenied(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	id, _ := teamInvite(t, app, owner, testutil.Email("invite"), "member")

	for _, role := range []string{"member"} {
		person := tenantMember(t, app, owner.id, role)
		for _, action := range []struct{ method, path string }{
			{"GET", "/api/team"}, {"POST", "/api/team/invites"},
			{"POST", "/api/team/invites/" + id + "/resend"}, {"DELETE", "/api/team/invites/" + id},
			{"PATCH", "/api/team/members/" + owner.id}, {"DELETE", "/api/team/members/" + owner.id},
		} {
			status(t, person.c.Do(action.method, action.path,
				map[string]any{"email": testutil.Email("denied"), "role": "owner"}), 403)
		}
	}
}

func TestTeamLastOwnerGuard(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	status(t, owner.c.Do("PATCH", "/api/team/members/"+owner.id, map[string]any{"role": "member"}), 409)
	status(t, owner.c.Do("DELETE", "/api/team/members/"+owner.id, nil), 403)
	second := tenantMember(t, app, owner.id, "owner")

	// Either owner can demote the other, but the new sole owner cannot leave.
	status(t, owner.c.Do("PATCH", "/api/team/members/"+second.id, map[string]any{"role": "member"}), 200)
	status(t, owner.c.Do("PATCH", "/api/team/members/"+owner.id, map[string]any{"role": "member"}), 409)
	status(t, owner.c.Do("PATCH", "/api/team/members/"+second.id, map[string]any{"role": "owner"}), 200)
	status(t, second.c.Do("PATCH", "/api/team/members/"+owner.id, map[string]any{"role": "member"}), 200)
	status(t, second.c.Do("PATCH", "/api/team/members/"+second.id, map[string]any{"role": "member"}), 409)
	status(t, second.c.Do("PATCH", "/api/team/members/"+owner.id, map[string]any{"role": "owner"}), 200)

	var wait sync.WaitGroup
	results := make(chan int, 2)
	for _, person := range []tradeUser{owner, second} {
		wait.Add(1)
		go func() {
			defer wait.Done()
			results <- person.c.Do("PATCH", "/api/team/members/"+person.id, map[string]any{"role": "member"}).Status
		}()
	}
	wait.Wait()
	close(results)
	wins, conflicts := 0, 0
	for result := range results {
		if result == 200 {
			wins++
		} else if result == 409 {
			conflicts++
		} else {
			t.Fatalf("race returned %d", result)
		}
	}
	if wins != 1 || conflicts != 1 || tradeText(t, app, `SELECT count(*)::text
		FROM business_members WHERE business_id=$1 AND role='owner'`, owner.id) != "1" {
		t.Fatal("concurrent demotion did not preserve exactly one owner")
	}
}

func TestTeamOtherBusinessCannotTouch(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")
	member := tenantMember(t, app, owner.id, "member")
	id, _ := teamInvite(t, app, owner, testutil.Email("private"), "owner")
	view := status(t, other.c.Do("GET", "/api/team", nil), 200)
	if len(view.Body["members"].([]any)) != 1 || len(view.Body["invites"].([]any)) != 0 {
		t.Fatalf("another business leaked into directory: %v", view.Body)
	}

	status(t, other.c.Do("POST", "/api/team/invites/"+id+"/resend", nil), 404)
	status(t, other.c.Do("DELETE", "/api/team/invites/"+id, nil), 404)
	status(t, other.c.Do("PATCH", "/api/team/members/"+member.id, map[string]any{"role": "owner"}), 404)
	status(t, other.c.Do("DELETE", "/api/team/members/"+member.id, nil), 404)
	email := testutil.Email("scoped")
	status(t, other.c.Do("POST", "/api/team/invites", map[string]any{
		"email": email, "role": "member", "business_id": owner.id,
	}), 200)
	if got := tradeText(t, app, `SELECT business_id FROM business_invites WHERE email=$1`, email); got != other.id {
		t.Fatal("caller selected another business through the body")
	}
}

func TestInviteNewPersonSignsUp(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	email := testutil.Email("new-person")
	_, token := teamInvite(t, app, owner, email, "manager")
	client := app.NewClient(t)
	preview := status(t, client.Do("GET", "/api/auth/invites/"+token, nil), 200)
	if preview.Body["role"] != "manager" || preview.Body["email"] == email || len(preview.Body) != 3 {
		t.Fatalf("unsafe preview: %v", preview.Body)
	}
	status(t, client.Do("POST", "/api/auth/invites/accept", map[string]any{
		"token": token, "name": "New Person", "password": goodPassword,
		"accepted_terms_version": config.NoticeVersion,
	}), 200)
	status(t, signIn(t, client, email, goodPassword), 200)
	me := status(t, client.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if me["role"] != "business" || me["emailVerified"] != true || me["profileComplete"] != true ||
		me["active_business_id"] != owner.id || me["business_role"] != "manager" {
		t.Fatalf("invite signup = %v", me)
	}
	status(t, client.Do("GET", "/api/team", nil), 200)
}

func TestInviteExistingUserAccepts(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	person := tradeNewUser(t, app, "collector")
	_, token := teamInvite(t, app, owner, person.email, "owner")
	status(t, owner.c.Do("POST", "/api/auth/invites/accept", map[string]any{"token": token}), 403)
	status(t, app.NewClient(t).Do("POST", "/api/auth/invites/accept", map[string]any{"token": token}), 401)
	status(t, person.c.Do("POST", "/api/auth/invites/accept", map[string]any{"token": token}), 200)
	me := status(t, person.c.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if me["role"] != "collector" || me["business_role"] != "owner" || me["active_business_id"] != owner.id {
		t.Fatalf("existing platform role lost: %v", me)
	}
	status(t, person.c.Do("GET", "/api/team", nil), 200)

	other := tradeNewUser(t, app, "business")
	_, token = teamInvite(t, app, other, person.email, "manager")
	status(t, person.c.Do("POST", "/api/auth/invites/accept", map[string]any{"token": token}), 200)
	me = status(t, person.c.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if me["active_business_id"] != owner.id {
		t.Fatal("second invite switched an already selected business")
	}
}

func TestInviteGuestAccepts(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	client := app.NewClient(t)
	email := signUp(t, app, client, true)
	status(t, signIn(t, client, email, goodPassword), 200)
	_, token := teamInvite(t, app, owner, email, "member")
	status(t, client.Do("GET", "/api/team", nil), 403)
	status(t, client.Do("POST", "/api/auth/invites/accept", map[string]any{"token": token}), 200)
	me := status(t, client.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if me["role"] != "business" || me["profileComplete"] != true || me["active_business_id"] != owner.id {
		t.Fatalf("guest was trapped in setup: %v", me)
	}
}

func TestInviteExpiredRevokedOrUsedIsRefused(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	person := tradeNewUser(t, app, "collector")
	message := ""
	for _, state := range []string{"expired", "revoked", "used"} {
		id, token := teamInvite(t, app, owner, person.email, "member")
		switch state {
		case "expired":
			tradeExec(t, app, `UPDATE business_invites SET expires_at=now()-interval '1 hour' WHERE id=$1`, id)
		case "revoked":
			status(t, owner.c.Do("DELETE", "/api/team/invites/"+id, nil), 200)
		case "used":
			status(t, person.c.Do("POST", "/api/auth/invites/accept", map[string]any{"token": token}), 200)
		}
		for _, action := range []struct{ method, path string }{
			{"GET", "/api/auth/invites/" + token}, {"POST", "/api/auth/invites/accept"},
		} {
			res := status(t, person.c.Do(action.method, action.path, map[string]any{"token": token}), 400)
			if message == "" {
				message = res.Body["message"].(string)
			} else if res.Body["message"] != message {
				t.Fatal("invalid link states reveal different messages")
			}
		}
		tradeExec(t, app, `UPDATE business_invites SET revoked_at=now() WHERE id=$1`, id)
	}
}

func TestInviteResendRotatesToken(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	person := tradeNewUser(t, app, "collector")
	id, old := teamInvite(t, app, owner, person.email, "member")
	status(t, owner.c.Do("POST", "/api/team/invites/"+id+"/resend", nil), 200)
	token := teamMailToken(t, app, id, person.email)
	if token == old {
		t.Fatal("resend returned the old token")
	}
	status(t, person.c.Do("GET", "/api/auth/invites/"+old, nil), 400)
	status(t, person.c.Do("POST", "/api/auth/invites/accept", map[string]any{"token": token}), 200)
	if got := tradeText(t, app, `SELECT count(*)::text FROM business_invites WHERE business_id=$1`, owner.id); got != "1" {
		t.Fatal("resend created another row")
	}
}

func TestInviteMailOnlyAfterCommit(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	person := tenantMember(t, app, owner.id, "member")
	person.email = testutil.Email("no-invite-mail")
	tradeExec(t, app, `UPDATE users SET email=$2 WHERE id=$1`, person.id, person.email)
	status(t, owner.c.Do("POST", "/api/team/invites", map[string]any{"email": person.email, "role": "member"}), 409)
	if !testutil.NoMail(t, person.email) {
		t.Fatal("failed invitation sent email")
	}
}

func TestInviteAlreadyMemberRefused(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	member := tenantMember(t, app, owner.id, "manager")
	status(t, owner.c.Do("POST", "/api/team/invites", map[string]any{"email": member.email, "role": "owner"}), 409)
	if got := tradeText(t, app, `SELECT role FROM business_members WHERE business_id=$1 AND user_id=$2`, owner.id, member.id); got != "manager" {
		t.Fatal("invite changed an existing member")
	}
	status(t, owner.c.Do("DELETE", "/api/team/members/"+member.id, nil), 200)
	teamInvite(t, app, owner, member.email, "owner")
}

func TestInviteTokenNotStored(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	id, token := teamInvite(t, app, owner, testutil.Email("hash"), "member")
	if hash := tradeText(t, app, `SELECT token_hash FROM business_invites WHERE id=$1`, id); hash != auth.HashToken(token) {
		t.Fatal("invitation did not store the token digest")
	}
	var days float64
	if err := app.DB.Pool.QueryRow(context.Background(), `SELECT extract(epoch FROM
		(expires_at-created_at))/86400 FROM business_invites WHERE id=$1`, id).Scan(&days); err != nil {
		t.Fatal(err)
	}
	if days < 6.99 || days > 7.01 {
		t.Fatalf("invite lifetime = %f days", days)
	}
}

func TestInviteRateLimit(t *testing.T) {
	app := testutil.Server(t, func(cfg *config.Config) { cfg.AuthRateLimit = 2 })
	client := app.NewClient(t)
	for range 2 {
		status(t, client.Do("GET", "/api/auth/invites/bad", nil), 400)
		status(t, client.Do("POST", "/api/auth/invites/accept", map[string]any{"token": "bad"}), 400)
	}
	status(t, client.Do("GET", "/api/auth/invites/bad", nil), 429)
	status(t, client.Do("POST", "/api/auth/invites/accept", map[string]any{"token": "bad"}), 429)
}
