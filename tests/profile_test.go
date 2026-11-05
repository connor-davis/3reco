package tests

import (
	"context"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestProfileUpdateCannotDesyncEmail(t *testing.T) {
	app := testutil.Server(t)
	owner, ownerID := domainUser(t, app, "business")
	other, otherID := domainUser(t, app, "business")
	anonymous := app.NewClient(t)
	before := status(t, owner.Do("GET", "/api/profile", nil), 200)

	for _, body := range []map[string]any{{"email": "changed@example.test"}, {"role": "admin"},
		{"id": otherID, "name": "Forged"}, {"user_id": ownerID}} {
		status(t, owner.Do("PATCH", "/api/profile", body), 400)
	}

	status(
		t,
		owner.Do(
			"PATCH",
			"/api/profile",
			map[string]any{
				"phone": " 082 123 4567 ", "name": "  Updated Name  ",
			},
		),
		200,
	)
	after := status(t, owner.Do("GET", "/api/profile", nil), 200)
	if after.Body["phone"] != "+27821234567" || after.Body["email"] != before.Body["email"] ||
		after.Body["name"] != "Updated Name" || after.Body["bank_account_number"] != "private-account" {
		t.Fatalf("profile: %s", after.Raw)
	}

	var phone, email string
	err := app.DB.Pool.QueryRow(
		context.Background(),
		`SELECT normalized_phone,email FROM users WHERE id=$1`,
		ownerID,
	).
		Scan(
			&phone,
			&email,
		)
	if err != nil || phone != "+27821234567" || email != before.Body["email"] {
		t.Fatalf("stored profile: %s %s %v", phone, email, err)
	}

	status(t, owner.Do("PATCH", "/api/profile", map[string]any{"phone": "123"}), 400)
	status(t, owner.Do("PATCH", "/api/profile", map[string]any{"bank_name": ""}), 400)
	status(t, owner.Do("PATCH", "/api/profile", map[string]any{"province": "Unknown"}), 400)

	status(t, anonymous.Do("GET", "/api/profile", nil), 401)
	status(t, anonymous.Do("PATCH", "/api/profile", map[string]any{"name": "forged"}), 401)
	status(t, anonymous.Do("GET", "/api/profile/optional", nil), 200)

	for _, client := range []*testutil.Client{other, anonymous} {
		result := status(
			t,
			client.Do("GET", "/api/profile?id="+ownerID, nil),
			map[bool]int{true: 401, false: 200}[client == anonymous],
		)
		if client == other && result.Body["id"] != otherID {
			t.Fatal("profile target accepted from query")
		}
		status(t, client.Do("PATCH", "/api/profile/"+ownerID, map[string]any{"name": "forged"}), 404)
	}

	noPrivateKeys(t, status(t, owner.Do("GET", "/api/profile/optional", nil), 200).Body)
	status(t, other.Do("PATCH", "/api/profile", map[string]any{"id": ownerID, "name": "forged"}), 400)
}

func TestUserDirectoryDoesNotLeakPrivateFields(t *testing.T) {
	app := testutil.Server(t)
	owner, ownerID := domainUser(t, app, "business")
	other, _ := domainUser(t, app, "collector")
	anonymous := app.NewClient(t)

	for _, client := range []*testutil.Client{anonymous, other} {
		for _, path := range []string{"/api/users/" + ownerID, "/api/stores/" + ownerID, "/api/stores"} {
			noPrivateKeys(t, status(t, client.Do("GET", path, nil), 200).Body)
		}
	}

	result := status(t, owner.Do("GET", "/api/users?role=collector", nil), 200)
	if len(pageItems(t, result)) != 1 {
		t.Fatalf("directory: %s", result.Raw)
	}
	noPrivateKeys(t, result.Body)
	status(t, anonymous.Do("GET", "/api/users?role=collector", nil), 401)
	status(t, other.Do("GET", "/api/users?role=admin", nil), 400)

	_, err := app.DB.Pool.Exec(
		context.Background(),
		`UPDATE users SET is_removed=true WHERE id=$1`,
		ownerID,
	)
	if err != nil {
		t.Fatal(err)
	}

	status(t, anonymous.Do("GET", "/api/users/"+ownerID, nil), 404)
	status(t, anonymous.Do("GET", "/api/stores/"+ownerID, nil), 404)
}

func TestBusinessProfileRequiresBankDetails(t *testing.T) {
	app := testutil.Server(t)
	owner, _ := domainUser(t, app, "business")
	status(
		t,
		owner.Do(
			"PATCH",
			"/api/profile",
			map[string]any{
				"bank_account_holder_name": "", "bank_name": "", "bank_account_number": "",
				"bank_branch_code": "", "bank_account_type": "",
			},
		),
		200,
	)
	status(t, owner.Do("PATCH", "/api/profile", map[string]any{"profile_complete": true}), 400)
	status(
		t,
		owner.Do(
			"PATCH",
			"/api/profile",
			map[string]any{
				"bank_account_holder_name": "Holder", "bank_name": "Bank", "bank_account_number": "123",
				"bank_branch_code": "123456", "bank_account_type": "Savings", "profile_complete": true,
			},
		),
		200,
	)
}
