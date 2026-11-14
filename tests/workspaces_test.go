package tests

import (
	"encoding/json"
	"testing"

	"github.com/connor-davis/3reco/internal/services/realtime"
	"github.com/connor-davis/3reco/tests/testutil"
)

func TestWorkspaceMineIsCallerOnlyAndOrdered(t *testing.T) {
	app := testutil.Server(t)
	person := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")
	stranger := tradeNewUser(t, app, "business")
	tradeExec(t, app, `UPDATE businesses SET business_name='Zulu' WHERE id=$1`, person.id)
	tradeExec(t, app, `UPDATE businesses SET business_name='Alpha',avatar_key='logo' WHERE id=$1`, other.id)
	tradeExec(t, app, `INSERT INTO business_members VALUES($1,$2,'member')`, other.id, person.id)

	response := status(t, person.c.Do("GET", "/api/businesses/mine", nil), 200)
	var items []map[string]any
	if err := json.Unmarshal(response.Raw, &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || items[0]["id"] != other.id || items[1]["id"] != person.id {
		t.Fatalf("wrong memberships or order (stranger %s): %v", stranger.id, items)
	}
	if items[0]["name"] != "Alpha" || items[0]["role"] != "member" || items[0]["has_logo"] != true {
		t.Fatalf("wrong workspace fields: %v", items[0])
	}
	for _, item := range items {
		if len(item) != 4 {
			t.Fatalf("private business fields leaked: %v", item)
		}
	}
}

func TestWorkspaceSelectionIsSessionLocalAndReloadsRole(t *testing.T) {
	app := testutil.Server(t)
	person := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")
	tradeExec(t, app, `INSERT INTO business_members VALUES($1,$2,'member')`, other.id, person.id)
	second := app.NewClient(t)
	status(t, signIn(t, second, person.email, goodPassword), 200)

	// Owners can edit a cart; Members may read it but cannot change it.
	path := "/api/cart?seller_id=" + other.id
	body := map[string]any{"items": []any{}}
	status(t, person.c.Do("PUT", path, body), 200)
	response := status(t, person.c.Do("POST", "/api/businesses/"+other.id+"/select", nil), 200)
	user := response.Body["user"].(map[string]any)
	if user["id"] != person.id || user["active_business_id"] != other.id || user["business_role"] != "member" {
		t.Fatalf("selection returned stale identity: %v", user)
	}

	user = status(t, person.c.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if user["active_business_id"] != other.id || user["business_role"] != "member" {
		t.Fatalf("selection did not persist: %v", user)
	}
	status(t, person.c.Do("PUT", "/api/cart?seller_id="+person.id, body), 403)
	status(t, person.c.Do("GET", "/api/team", nil), 403)

	user = status(t, second.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if user["active_business_id"] != person.id || user["business_role"] != "owner" {
		t.Fatalf("another session was changed: %v", user)
	}
	status(t, second.Do("PUT", path, body), 200)

	tradeExec(t, app, `UPDATE business_members SET role='manager' WHERE business_id=$1 AND user_id=$2`, other.id, person.id)
	response = status(t, person.c.Do("POST", "/api/businesses/"+other.id+"/select", nil), 200)
	if response.Body["user"].(map[string]any)["business_role"] != "manager" {
		t.Fatal("selecting the current business did not reload its role")
	}
	status(t, person.c.Do("PUT", "/api/cart?seller_id="+person.id, body), 200)
}

func TestWorkspaceSelectionRejectsOtherBusinessAndRemovedMembership(t *testing.T) {
	app := testutil.Server(t)
	person := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")
	status(t, person.c.Do("POST", "/api/businesses/"+other.id+"/select", nil), 404)
	status(t, person.c.Do("POST", "/api/businesses/missing/select", nil), 404)

	tradeExec(t, app, `INSERT INTO business_members VALUES($1,$2,'manager')`, other.id, person.id)
	tradeExec(t, app, `DELETE FROM business_members WHERE business_id=$1 AND user_id=$2`, other.id, person.id)
	status(t, person.c.Do("POST", "/api/businesses/"+other.id+"/select", nil), 404)
	tradeExec(t, app, `INSERT INTO business_members VALUES($1,$2,'manager')`, other.id, person.id)
	tradeExec(t, app, `UPDATE businesses SET is_removed=true WHERE id=$1`, other.id)
	status(t, person.c.Do("POST", "/api/businesses/"+other.id+"/select", nil), 404)

	user := status(t, person.c.Do("GET", "/api/auth/me", nil), 200).Body["user"].(map[string]any)
	if user["active_business_id"] != person.id || user["business_role"] != "owner" {
		t.Fatalf("failed selection changed the session: %v", user)
	}
}

func TestWorkspaceRoutesRejectNonBusinessRoles(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	for _, role := range []string{"admin", "staff", "collector", "guest"} {
		person := tradeNewUser(t, app, role)
		tradeExec(t, app, `INSERT INTO business_members VALUES($1,$2,'owner')`, owner.id, person.id)
		status(t, person.c.Do("GET", "/api/businesses/mine", nil), 403)
		status(t, person.c.Do("POST", "/api/businesses/"+owner.id+"/select", nil), 403)
	}

	client := app.NewClient(t)
	status(t, client.Do("GET", "/api/businesses/mine", nil), 401)
	status(t, client.Do("POST", "/api/businesses/"+owner.id+"/select", nil), 401)
}

func TestWorkspaceSelectionRechecksLiveSocket(t *testing.T) {
	app := testutil.Server(t)
	person := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")
	tradeExec(t, app, `INSERT INTO business_members VALUES($1,$2,'manager')`, other.id, person.id)
	second := app.NewClient(t)
	status(t, signIn(t, second, person.email, goodPassword), 200)
	oldSocket, _, err := dial(t, app, person.c, testutil.WebOrigin)
	if err != nil {
		t.Fatal(err)
	}
	secondSocket, _, err := dial(t, app, second, testutil.WebOrigin)
	if err != nil {
		t.Fatal(err)
	}

	status(t, person.c.Do("POST", "/api/businesses/"+other.id+"/select", nil), 200)
	if code := closeCode(t, oldSocket); code != realtime.CloseMembershipEnded {
		t.Fatalf("old business socket kept access: close %d", code)
	}
	newSocket, _, err := dial(t, app, person.c, testutil.WebOrigin)
	if err != nil {
		t.Fatal(err)
	}

	// The other session keeps hearing its own business; the switched one hears its new business.
	oldOwner := person
	oldOwner.c = second
	_, _ = teamInvite(t, app, oldOwner, testutil.Email("old-workspace"), "member")
	secondSocket.hear("team", person.id)
	_, _ = teamInvite(t, app, other, testutil.Email("new-workspace"), "member")
	newSocket.hear("team", other.id)
}
