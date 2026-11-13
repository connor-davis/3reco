package tests

import "testing"

// find returns the item with this id from a page of rows.
func find(rows []map[string]any, id string) map[string]any {
	for _, row := range rows {
		if row["id"] == id {
			return row
		}
	}

	return nil
}

// Admin and staff show by their own name; a business shows by its business name.
func TestAdminUserListNamesThePerson(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")

	// A staff member who was once a business keeps a stale business name.
	tradeBusiness(t, w.app, staff.id, "Temp", false)
	tradeExec(t, w.app, `UPDATE users SET first_name='Sipho', last_name='Ndlovu'
		WHERE id = $1`, staff.id)

	list := pageItems(t, status(t, admin.c.Do("GET", "/api/admin/users?limit=50", nil), 200))

	if got := find(list, staff.id)["name"]; got != "Sipho Ndlovu" {
		t.Errorf("staff shown as %v, want Sipho Ndlovu", got)
	}

	biz := find(list, w.seller.id)["name"].(string)
	if biz != tradeText(t, w.app, `SELECT business_name FROM businesses WHERE id=$1`, w.seller.id) {
		t.Errorf("business shown as %q, want its business name", biz)
	}

	status(t, staff.c.Do("GET", "/api/admin/users", nil), 403)
	status(t, w.seller.c.Do("GET", "/api/admin/users", nil), 403)
}

// Privacy events say who did it and to whom, by name and role; the ids stay.
func TestPrivacyEventsCarryNamesAndRoles(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")

	tradeBusiness(t, w.app, admin.id, "Stale Business", false)
	tradeExec(t, w.app, `UPDATE users SET first_name='Ada', last_name='Admin' WHERE id = $1`, admin.id)

	collector := privacyCollector(t, w.buyer.c)
	status(t, admin.c.Do("GET", "/api/collectors/"+collector, nil), 200)

	var event map[string]any

	for _, item := range pageItems(t, status(t, admin.c.Do("GET", "/api/admin/privacy-events", nil), 200)) {
		if item["subject_id"] == collector {
			event = item
		}
	}

	if event == nil {
		t.Fatal("no event for the collector")
	}

	if event["actor_id"] != admin.id || event["actor_name"] != "Ada Admin" || event["actor_role"] != "admin" {
		t.Errorf("actor not named: %v", event)
	}

	wantName := tradeText(t, w.app, `SELECT name FROM collectors WHERE id=$1`, collector)
	if event["subject_name"] != wantName || event["subject_role"] != "collector" {
		t.Errorf("subject not named: %v", event)
	}

	status(t, w.seller.c.Do("GET", "/api/admin/privacy-events", nil), 403)
}

// Removal is permanent: there is no route that brings a removed user back.
func TestRemovedUserCannotBeRestored(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")

	for _, path := range []string{"/restore", "/undelete", "/reinstate"} {
		res := admin.c.Do("POST", "/api/admin/users/"+w.seller.id+path, nil)
		if res.Status != 404 && res.Status != 405 {
			t.Errorf("%s: status %d, want 404", path, res.Status)
		}
	}
}
