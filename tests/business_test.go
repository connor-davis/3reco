package tests

import (
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func businessCount(t *testing.T, app *testutil.App, userID string) string {
	t.Helper()

	return tradeText(t, app, `SELECT (SELECT count(*) FROM businesses WHERE id=$1)::text || '/' ||
		(SELECT count(*) FROM business_members WHERE user_id=$1)::text`, userID)
}

func TestBusinessReadsAreOwnerAndManagerOnly(t *testing.T) {
	w := newTradeWorld(t)
	seedBusinessBank(t, w.app, w.seller.id)
	manager := tenantMember(t, w.app, w.seller.id, "manager")
	member := tenantMember(t, w.app, w.seller.id, "member")
	collector := tradeNewUser(t, w.app, "collector")

	owner := status(t, w.seller.c.Do("GET", "/api/business", nil), 200).Body
	if owner["id"] != w.seller.id || owner["can_edit"] != true {
		t.Fatalf("owner read: %v", owner)
	}

	read := status(t, manager.c.Do("GET", "/api/business", nil), 200).Body
	if read["id"] != w.seller.id || read["can_edit"] != false {
		t.Fatalf("manager read: %v", read)
	}

	// The whole account number never leaves the server on a read.
	if got, _ := read["bank_account_number"].(string); strings.Contains(got, "private-account") || got == "" {
		t.Fatalf("bank account read whole or missing: %v", read["bank_account_number"])
	}

	tradeWant(t, "member read", member.c.Do("GET", "/api/business", nil), 403)
	tradeWant(t, "collector read", collector.c.Do("GET", "/api/business", nil), 403)
	tradeWant(t, "anonymous read", w.app.NewClient(t).Do("GET", "/api/business", nil), 401)

	// Another business's Owner reads their own business, never ours.
	if got := status(t, w.buyer.c.Do("GET", "/api/business", nil), 200).Body; got["id"] != w.buyer.id {
		t.Fatalf("buyer read a business that is not theirs: %v", got)
	}
}

func TestBusinessWritesAreOwnerOnlyAndStayInTheBusiness(t *testing.T) {
	w := newTradeWorld(t)
	manager := tenantMember(t, w.app, w.seller.id, "manager")
	member := tenantMember(t, w.app, w.seller.id, "member")
	name := func(id string) string {
		return tradeText(t, w.app, `SELECT business_name FROM businesses WHERE id=$1`, id)
	}
	before := name(w.seller.id)

	body := map[string]any{"business_name": "Hijacked"}
	tradeWant(t, "manager write", manager.c.Do("PATCH", "/api/business", body), 403)
	tradeWant(t, "member write", member.c.Do("PATCH", "/api/business", body), 403)
	tradeWant(t, "anonymous write", w.app.NewClient(t).Do("PATCH", "/api/business", body), 401)

	// A business id in the body is not accepted: the session decides which business.
	tradeWant(t, "forged id", w.buyer.c.Do("PATCH", "/api/business",
		map[string]any{"id": w.seller.id, "business_name": "Hijacked"}), 400)

	// Another business's Owner writes their own business and ours stays as it was.
	status(t, w.buyer.c.Do("PATCH", "/api/business", body), 200)

	if got := name(w.seller.id); got != before {
		t.Fatalf("our business name %q, want %q", got, before)
	}

	if got := name(w.buyer.id); got != "Hijacked" {
		t.Fatalf("their own business name %q", got)
	}

	// Our Owner can change it, and a blank name is refused.
	status(t, w.seller.c.Do("PATCH", "/api/business", map[string]any{"business_name": "Greenloop"}), 200)
	tradeWant(t, "blank name", w.seller.c.Do("PATCH", "/api/business", map[string]any{"business_name": " "}), 400)

	if got := name(w.seller.id); got != "Greenloop" {
		t.Fatalf("business name %q", got)
	}
}

func TestBusinessBankNumberMaskKeepsStoredOne(t *testing.T) {
	w := newTradeWorld(t)
	seedBusinessBank(t, w.app, w.seller.id)
	stored := func() string {
		return tradeText(t, w.app, `SELECT bank_account_number FROM businesses WHERE id=$1`, w.seller.id)
	}
	before := stored()

	mask := status(t, w.seller.c.Do("GET", "/api/business", nil), 200).Body["bank_account_number"]
	status(t, w.seller.c.Do("PATCH", "/api/business", map[string]any{"bank_account_number": mask, "city": "Paarl"}), 200)

	if stored() != before {
		t.Fatal("sending the mask back changed the stored account number")
	}

	status(t, w.seller.c.Do("PATCH", "/api/business", map[string]any{"bank_account_number": "9876543210"}), 200)

	if stored() == before || strings.Contains(stored(), "9876543210") {
		t.Fatal("a new account number was not stored sealed")
	}

	if got := status(t, w.seller.c.Do("GET", "/api/business", nil), 200).Body["bank_account_number"]; got != "•••• 3210" {
		t.Fatalf("new account number read as %v", got)
	}
}

func TestBusinessLogoAndExportAreOwnerOnly(t *testing.T) {
	w := newTradeWorld(t)
	seedBusinessBank(t, w.app, w.seller.id)
	manager := tenantMember(t, w.app, w.seller.id, "manager")
	logo := func(c *testutil.Client) testutil.Response {
		return uploadImage(t, w.app, c, "/api/business/logo", receiptImage(3))
	}

	tradeWant(t, "manager logo", logo(manager.c), 403)
	tradeWant(t, "manager logo delete", manager.c.Do("DELETE", "/api/business/logo", nil), 403)
	tradeWant(t, "manager export", manager.c.Do("GET", "/api/business/export", nil), 403)
	tradeWant(t, "anonymous export", w.app.NewClient(t).Do("GET", "/api/business/export", nil), 401)

	got := logo(w.seller.c)
	tradeWant(t, "owner logo", got, 200)

	if got.Body["avatar_url"] != "/api/stores/"+w.seller.id+"/logo" {
		t.Fatalf("logo url: %s", got.Raw)
	}

	// The logo is the business's; the Owner's own picture is a different thing.
	if tradeText(t, w.app, `SELECT COALESCE(avatar_key,'') FROM users WHERE id=$1`, w.seller.id) != "" {
		t.Fatal("the logo was written to the person")
	}

	if status(t, w.seller.c.Do("GET", "/api/profile", nil), 200).Body["avatar_url"] != "" {
		t.Fatal("the logo shows as the person's picture")
	}

	status(t, w.seller.c.Do("DELETE", "/api/business/logo", nil), 200)

	if tradeText(t, w.app, `SELECT COALESCE(avatar_key,'') FROM businesses WHERE id=$1`, w.seller.id) != "" {
		t.Fatal("the logo was not cleared")
	}

	export := status(t, w.seller.c.Do("GET", "/api/business/export", nil), 200).Body
	row, _ := export["business"].(map[string]any)

	if row["id"] != w.seller.id || row["bank_account_number"] != "private-account" || export["exported_at"] == nil {
		t.Fatalf("export business: %v", row)
	}

	// Only this business's rows are in it, and nobody else's account number.
	raw := string(w.seller.c.Do("GET", "/api/business/export", nil).Raw)
	if strings.Contains(raw, w.buyer.id+`","business_name`) {
		t.Fatal("the export holds another business")
	}

	if tradeText(t, w.app, `SELECT count(*)::text FROM privacy_events WHERE actor_id=$1 AND kind='export' AND details->>'export_kind'='business'`, w.seller.id) == "0" {
		t.Fatal("the business export was not recorded")
	}

	// The personal export stays the person's own.
	personal := status(t, w.seller.c.Do("GET", "/api/privacy/export", nil), 200).Body
	if _, ok := personal["business"]; ok {
		t.Fatalf("personal export grew a business: %v", personal)
	}
}

func TestSetupCreatesTheBusinessOnce(t *testing.T) {
	app := testutil.Server(t)
	guest, id := newGuest(t, app)

	// A guest reads an empty business to fill in: the guest gate lets them in.
	empty := status(t, guest.Do("GET", "/api/business", nil), 200).Body
	if empty["can_edit"] != true || empty["business_name"] != "" {
		t.Fatalf("guest business: %v", empty)
	}

	if businessCount(t, app, id) != "0/0" {
		t.Fatal("reading made a business")
	}

	fillProfile(t, guest, true)

	// Saving made one business with the guest as its Owner.
	if got := businessCount(t, app, id); got != "1/1" {
		t.Fatalf("businesses/memberships %s, want 1/1", got)
	}

	if got := tradeText(t, app, `SELECT role FROM business_members WHERE user_id=$1`, id); got != "owner" {
		t.Fatalf("role %q, want owner", got)
	}

	// Saving again changes that business; it never makes a second one.
	status(t, guest.Do("PATCH", "/api/business", map[string]any{"city": "Cape Town"}), 200)

	if got := businessCount(t, app, id); got != "1/1" {
		t.Fatalf("businesses/memberships %s after a second save", got)
	}

	status(t, guest.Do("POST", "/api/profile/setup", map[string]any{"role": "business"}), 200)
}

func TestBusinessIsClosedToCollectorsAndStaff(t *testing.T) {
	app := testutil.Server(t)

	for _, role := range []string{"collector", "staff", "admin"} {
		user := tradeNewUser(t, app, role)
		tradeWant(t, role+" create", user.c.Do("PATCH", "/api/business", map[string]any{"business_name": "Nope"}), 403)

		if businessCount(t, app, user.id) != "0/0" {
			t.Fatalf("%s got a business", role)
		}
	}

	// A person who already owns a business under their own id cannot open another.
	owner := tradeNewUser(t, app, "business")
	tradeExec(t, app, `DELETE FROM business_members WHERE user_id=$1`, owner.id)
	tradeExec(t, app, `UPDATE sessions SET active_business_id=NULL WHERE user_id=$1`, owner.id)
	tradeWant(t, "second business", owner.c.Do("PATCH", "/api/business", map[string]any{"business_name": "Two"}), 409)
}

func TestProfileRefusesBusinessFields(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "manager")

	for name, body := range map[string]map[string]any{
		"name":     {"business_name": "Nope"},
		"number":   {"business_registration_number": "1"},
		"bank":     {"bank_name": "Nope"},
		"location": {"city": "Nope"},
	} {
		tradeWant(t, "owner "+name, w.seller.c.Do("PATCH", "/api/profile", body), 400)
		tradeWant(t, "manager "+name, member.c.Do("PATCH", "/api/profile", body), 400)
	}

	if tradeText(t, w.app, `SELECT COALESCE(city,'') FROM businesses WHERE id=$1`, w.seller.id) == "Nope" {
		t.Fatal("a refused profile save changed the business")
	}
}
