package tests

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/tests/testutil"
)

func TestProfileAvatarOwnershipAndCleanup(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	stranger := tradeNewUser(t, app, "business")
	legacy := "https://identity.example.test/picture.png"
	tradeExec(t, app, `UPDATE users SET image=$2 WHERE id=$1`, owner.id, legacy)
	tradeExec(t, app, `UPDATE businesses SET image=$2 WHERE id=$1`, owner.id, legacy)
	before := owner.c.Do("GET", "/api/profile", nil)
	if before.Body["avatar_url"] != legacy {
		t.Fatal("legacy image fallback missing")
	}

	path := "/api/stores/" + owner.id + "/logo"
	tradeWant(t, "foreign avatar write", uploadImage(t, app, stranger.c, path, receiptImage(1)), 404)
	tradeWant(t, "foreign avatar delete", stranger.c.Do("DELETE", path, nil), 404)
	tradeWant(t, "anonymous upload", uploadImage(t, app, app.NewClient(t), "/api/profile/avatar", receiptImage(1)), 401)
	for _, data := range [][]byte{nil, []byte("GIF89a"),
		append(receiptImage(1), make([]byte, 2<<20)...)} {
		tradeWant(t, "bad avatar", uploadImage(t, app, owner.c, "/api/profile/avatar", data), 400)
	}

	image := receiptImage(7)
	got := uploadImage(t, app, owner.c, "/api/profile/avatar", image)
	tradeWant(t, "avatar uploaded", got, 200)
	if got.Body["avatar_url"] != path || strings.Contains(string(got.Raw), "avatars/") {
		t.Fatalf("avatar projection: %s", got.Raw)
	}
	public := app.NewClient(t).Do("GET", path, nil)
	if public.Status != 200 || !bytes.Equal(public.Raw, image) {
		t.Fatal("public avatar bytes differ")
	}
	for _, route := range []string{"/api/stores/" + owner.id} {
		if got := stranger.c.Do("GET", route, nil); got.Body["avatar_url"] != path {
			t.Fatalf("avatar URL missing in %s: %s", route, got.Raw)
		}
	}
	if got := stranger.c.Do("GET", "/api/profile", nil); got.Body["avatar_url"] != "" {
		t.Fatal("upload changed someone else's avatar")
	}

	old := tradeText(t, app, `SELECT avatar_key FROM businesses WHERE id=$1`, owner.id)
	// The multipart name and declared MIME are ignored; detection permits WEBP.
	webp := []byte("RIFF1234WEBPVP8 " + strings.Repeat("x", 32))
	tradeWant(t, "replace WEBP", uploadImage(t, app, owner.c, "/api/profile/avatar", webp), 200)
	if reader, err := app.Storage.Get(context.Background(), old); err == nil {
		_ = reader.Close()
		t.Fatal("replaced avatar object remains")
	}
	if count := objectCount(t, app, "avatars/"); count != 1 {
		t.Fatalf("avatar objects %d, want 1", count)
	}

	tradeWant(t, "clear avatar", owner.c.Do("DELETE", "/api/profile/avatar", nil), 200)
	if count := objectCount(t, app, "avatars/"); count != 0 {
		t.Fatal("deleted avatar object remains")
	}
	tradeWant(t, "cleared public avatar", stranger.c.Do("GET", path, nil), 404)
	if got := owner.c.Do("GET", "/api/profile", nil); got.Body["avatar_url"] != legacy {
		t.Fatal("clearing uploaded avatar lost the legacy fallback")
	}
}

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
	tradeExec(t, app, `UPDATE businesses SET is_removed=true WHERE id=$1`, ownerID)
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

func TestProfileReadOwnPayoutAndPatchKeepsIt(t *testing.T) {
	app := testutil.Server(t)
	owner, _ := domainUser(t, app, "business")
	idMask, bankMask := crypt.Mask("private-id"), crypt.Mask("private-account")

	got := status(t, owner.Do("GET", "/api/profile", nil), 200)
	if got.Body["id_number"] != idMask || got.Body["bank_account_number"] != "private-account" ||
		strings.Contains(string(got.Raw), "private-id") {
		t.Fatalf("profile id not masked or own account not whole: %s", got.Raw)
	}

	export := func() map[string]any {
		return status(t, owner.Do("GET", "/api/privacy/export", nil), 200).Body["profile"].(map[string]any)
	}

	// The mask sent back keeps what is stored, and so does the whole number or a blank.
	for _, sent := range []string{idMask} {
		status(t, owner.Do("PATCH", "/api/profile", map[string]any{"id_number": sent, "bank_account_number": bankMask}), 200)
		if p := export(); p["id_number"] != "private-id" || p["bank_account_number"] != "private-account" {
			t.Fatalf("PATCH %q changed a stored value: %v", sent, p)
		}
	}

	// Saving other fields, or the whole number as read, keeps the payout.
	status(t, owner.Do("PATCH", "/api/profile", map[string]any{"city": "Paarl"}), 200)
	status(t, owner.Do("PATCH", "/api/profile", map[string]any{"bank_account_number": "private-account"}), 200)

	if p := export(); p["id_number"] != "private-id" || p["bank_account_number"] != "private-account" {
		t.Fatalf("export lost full values: %v", p)
	}

	// A new value replaces the old one; the export still shows it in full.
	status(t, owner.Do("PATCH", "/api/profile", map[string]any{"bank_account_number": "9876543210"}), 200)
	if p := export(); p["bank_account_number"] != "9876543210" || p["id_number"] != "private-id" {
		t.Fatalf("export after change: %v", p)
	}
	if got := status(t, owner.Do("GET", "/api/profile", nil), 200); got.Body["bank_account_number"] != "9876543210" {
		t.Fatalf("changed value not whole: %s", got.Raw)
	}
}
