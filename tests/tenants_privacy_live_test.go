package tests

import (
	"bytes"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestTenantCollectorsProfileAndInvoicePermissions(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "member")
	manager := tenantMember(t, w.app, w.seller.id, "manager")
	owner := tenantMember(t, w.app, w.seller.id, "owner")
	own := privacyCollector(t, w.seller.c)
	foreign := privacyCollector(t, w.buyer.c)
	tradeUnverify(t, w.app, w.seller)

	view := status(t, member.c.Do("GET", "/api/collectors/"+foreign, nil), 200)
	if view.Body["can_edit"] == true || view.Body["can_view_payout"] == true || shown(view.Body, "email") {
		t.Fatalf("another business's collector details escaped: %s", view.Raw)
	}
	status(t, manager.c.Do("PATCH", "/api/collectors/"+foreign, map[string]any{"name": "foreign"}), 200)
	status(t, manager.c.Do("PATCH", "/api/collectors/"+foreign, map[string]any{"bank_name": "foreign"}), 403)
	status(t, member.c.Do("PATCH", "/api/collectors/"+own, map[string]any{"name": "member"}), 403)
	status(t, member.c.Do("POST", "/api/collectors", collectorBody(domainPhone())), 403)
	status(t, manager.c.Do("PATCH", "/api/collectors/"+own, map[string]any{"name": "team collector"}), 200)

	bank := map[string]any{
		"bank_account_holder_name": "Business Holder", "bank_name": "Business Bank",
		"bank_account_number": "123456789", "bank_branch_code": "250655", "bank_account_type": "Savings",
	}
	status(t, member.c.Do("PATCH", "/api/business", bank), 403)
	status(t, manager.c.Do("PATCH", "/api/business", bank), 403)
	status(t, owner.c.Do("PATCH", "/api/business", bank), 200)
	sealed := tradeText(t, w.app, `SELECT bank_account_number FROM businesses WHERE id=$1`, w.seller.id)
	status(t, member.c.Do("PATCH", "/api/profile", map[string]any{"first_name": "Personal"}), 200)
	if got := tradeText(t, w.app, `SELECT bank_account_number FROM businesses WHERE id=$1`, w.seller.id); got != sealed {
		t.Fatal("a personal edit rewrote the business's bank details")
	}
	if got := tradeText(t, w.app, `SELECT first_name FROM users WHERE id=$1`, member.id); got != "Personal" {
		t.Fatalf("personal edit went to the business founder: %s", got)
	}

	for _, path := range []string{"/api/profile", "/api/privacy/export"} {
		view := status(t, member.c.Do("GET", path, nil), 200)
		if bytes.Contains(view.Raw, []byte("123456789")) || bytes.Contains(view.Raw, []byte("Business Bank")) {
			t.Fatalf("member read bank details from %s: %s", path, view.Raw)
		}
	}

	tradeExec(t, w.app, `UPDATE users SET bank_account_number=$2 WHERE id=$1`,
		member.id, testutil.Seal(t, "personal-only"))
	export := status(t, member.c.Do("GET", "/api/privacy/export", nil), 200)
	if export.Body["person"].(map[string]any)["bank_account_number"] != "personal-only" {
		t.Fatal("business membership hid the person's own bank data from their export")
	}

	trade := tradeSale(t, manager, w.buyer, w.material, "1", "8")
	path := "/api/transactions/" + trade + "/invoice"
	pdf := status(t, member.c.Do("GET", path, nil), 200)
	if pdfHas(t, pdf.Raw, "123456789") || pdfHas(t, pdf.Raw, "Business Bank") {
		t.Fatal("member invoice disclosed bank details")
	}
	status(t, manager.c.Do("GET", path, nil), 200)
	status(t, uploadImage(t, w.app, member.c, "/api/transactions/"+trade+"/receipts", receiptImage(3)), 403)
	status(t, member.c.Do("DELETE", "/api/transactions/"+trade+"/receipts/missing", nil), 403)
}

func TestTenantEraseKeepsBusinessWithAnotherOwner(t *testing.T) {
	w := newTradeWorld(t)
	owner := tenantMember(t, w.app, w.seller.id, "owner")
	name := tradeText(t, w.app, `SELECT business_name FROM businesses WHERE id=$1`, w.seller.id)
	request := tradeRequest(t, w.buyer, w.seller, w.stock)
	trade := tradeSale(t, w.seller, w.buyer, w.material, "1", "8")
	status(t, uploadImage(t, w.app, w.seller.c, "/api/business/logo", receiptImage(2)), 200)
	logo := tradeText(t, w.app, `SELECT avatar_key FROM businesses WHERE id=$1`, w.seller.id)

	status(t, w.seller.c.Do("POST", "/api/privacy/delete", map[string]any{"password": goodPassword}), 200)
	status(t, w.seller.c.Do("GET", "/api/auth/me", nil), 401)
	status(t, owner.c.Do("GET", "/api/requests/"+request, nil), 200)
	status(t, owner.c.Do("GET", "/api/transactions/"+trade, nil), 200)
	status(t, owner.c.Do("GET", "/api/stock/"+w.stock, nil), 200)
	status(t, owner.c.Do("GET", "/api/stores/"+w.seller.id+"/logo", nil), 200)
	stockObject(t, w.app, logo, true)

	if got := tradeText(t, w.app, `SELECT business_name FROM businesses WHERE id=$1`, w.seller.id); got != name {
		t.Fatalf("erasing one owner changed the shared business: %s", got)
	}
	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id=$1`, request); got != "pending" {
		t.Fatalf("erasing one owner closed the team's request: %s", got)
	}
}

func TestTenantRealtimeMembersAndImmediateRemoval(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "member")
	outsider := tradeNewUser(t, w.app, "business")
	tradeExec(t, w.app, `UPDATE stock SET is_listed=false WHERE id=$1`, w.stock)
	socks := joinLive(t, w.app, member, outsider)

	tradeExec(t, w.app, `UPDATE stock SET price=9 WHERE id=$1`, w.stock)
	socks[0].hear("stock", w.stock)
	socks[1].quiet("non-member")

	tradeExec(t, w.app, `DELETE FROM business_members WHERE business_id=$1 AND user_id=$2`, w.seller.id, member.id)
	if !closedByServer(socks[0]) {
		t.Fatal("membership removal left the socket open")
	}
	status(t, member.c.Do("GET", "/api/stock/"+w.stock, nil), 404)
}

func TestTenantBusinessNotificationsEndWithMembership(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "member")
	request := tradeRequest(t, w.buyer, w.seller, w.stock)
	view := status(t, member.c.Do("GET", "/api/notifications", nil), 200)
	if !bytes.Contains(view.Raw, []byte(request)) {
		t.Fatalf("business member did not receive its notice: %s", view.Raw)
	}

	tradeExec(t, w.app, `DELETE FROM business_members WHERE business_id=$1 AND user_id=$2`, w.seller.id, member.id)
	view = status(t, member.c.Do("GET", "/api/notifications", nil), 200)
	if bytes.Contains(view.Raw, []byte(request)) {
		t.Fatalf("removed member still reads business notices: %s", view.Raw)
	}
	view = status(t, member.c.Do("GET", "/api/privacy/export", nil), 200)
	if bytes.Contains(view.Raw, []byte(request)) {
		t.Fatalf("privacy export bypassed removed membership: %s", view.Raw)
	}

	notice := tradeText(t, w.app, `SELECT id FROM notifications
		WHERE user_id=$1 AND business_id=$2 LIMIT 1`, member.id, w.seller.id)
	tradeExec(t, w.app, `INSERT INTO business_members VALUES($1,$2,'member')`, w.buyer.id, member.id)
	tradeExec(t, w.app, `UPDATE sessions SET active_business_id=$2 WHERE user_id=$1`, member.id, w.buyer.id)
	socks := joinLive(t, w.app, member, w.seller)
	tradeExec(t, w.app, `UPDATE notifications SET read=true WHERE id=$1`, notice)
	tradeExec(t, w.app, `INSERT INTO notifications(id,user_id,type,title,body)
		VALUES('notice-barrier',$1,'message_received','Personal','Personal')`, w.seller.id)
	socks[1].hear("notification", "notice-barrier")
	socks[0].quiet("removed member on another business")
}
