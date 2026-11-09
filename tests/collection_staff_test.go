package tests

import "testing"

// collectionKgIs reports whether an owner holds exactly this many kg of the
// world's material, whatever decimals the column prints.
func collectionKgIs(t *testing.T, w tradeWorld, owner, kg string) bool {
	t.Helper()

	return tradeText(t, w.app, `
		SELECT (COALESCE(sum(weight), 0) = $3::numeric)::text
		FROM stock WHERE owner_id = $1 AND material_id = $2`,
		owner, w.material, kg) == "true"
}

// Admin and staff record a collection for a business they pick: the business
// gets the stock and the recorder gets none.
func TestAdminAndStaffRecordCollectionForBusiness(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000011")

	for i, role := range []string{"admin", "staff"} {
		recorder := tradeNewUser(t, w.app, role)

		res := recorder.c.Do("POST", "/api/transactions/collections",
			tradeCollection(collector, w.buyer.id, tradeLine(w.material, "10", "6")))
		tradeWant(t, role+" records", res, 200)

		txID, _ := res.Body["transaction_id"].(string)
		if txID == "" {
			t.Fatalf("%s: no transaction_id in %s", role, res.Raw)
		}

		if got := tradeText(t, w.app, `SELECT buyer_id FROM transactions WHERE id = $1`, txID); got != w.buyer.id {
			t.Errorf("%s: buyer %s, want the chosen business %s", role, got, w.buyer.id)
		}

		// Each pass adds 10 kg to the same business.
		kg := []string{"10", "20"}[i]
		if !collectionKgIs(t, w, w.buyer.id, kg) {
			t.Errorf("%s: business stock is not %s kg", role, kg)
		}

		if !collectionKgIs(t, w, recorder.id, "0") {
			t.Errorf("%s: recorder holds stock, want none", role)
		}
	}
}

// Without a business, with a removed one, or with a user who is not a business,
// nothing is written.
func TestAdminCollectionRefusesBadBusiness(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000012")
	admin := tradeNewUser(t, w.app, "admin")
	line := tradeLine(w.material, "10", "6")

	removed := tradeNewUser(t, w.app, "business")
	tradeExec(t, w.app, `UPDATE users SET is_removed = true WHERE id = $1`, removed.id)

	notBusiness := tradeNewUser(t, w.app, "collector")

	tradeWant(t, "no business", admin.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", line)), 400)
	tradeWant(t, "removed business", admin.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, removed.id, line)), 400)
	tradeWant(t, "not a business", admin.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, notBusiness.id, line)), 400)
	tradeWant(t, "unknown business", admin.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "nobody", line)), 400)

	if n := tradeText(t, w.app, `SELECT count(*)::text FROM transactions`); n != "0" {
		t.Errorf("%s transactions after refused collections, want 0", n)
	}

	for _, owner := range []string{removed.id, notBusiness.id, admin.id} {
		if !collectionKgIs(t, w, owner, "0") {
			t.Errorf("%s holds stock, want none", owner)
		}
	}
}

// A guest may not record a collection for any business.
func TestGuestCannotRecordCollection(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000013")
	guest := tradeNewUser(t, w.app, "guest")

	tradeWant(t, "guest records", guest.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, w.buyer.id, tradeLine(w.material, "10", "6"))), 403)

	if n := tradeText(t, w.app, `SELECT count(*)::text FROM transactions`); n != "0" {
		t.Errorf("%s transactions after a guest collection, want 0", n)
	}
}
