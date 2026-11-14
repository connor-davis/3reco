package tests

import (
	"bytes"
	"testing"
)

func TestTenantStockMembersUseBusinessOwnership(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "member")
	foreign := tradeStock(t, w.app, w.buyer.id, w.material, "10", "8")
	tradeExec(t, w.app, `UPDATE stock SET is_listed=false WHERE id=$1`, foreign)

	items := pageItems(t, status(t, member.c.Do("GET", "/api/stock", nil), 200))
	if len(items) != 1 || items[0]["id"] != w.stock {
		t.Fatalf("stock is scoped to the person instead of the business: %v", items)
	}

	status(t, member.c.Do("PATCH", "/api/stock/"+w.stock, map[string]any{"price": "9"}), 200)
	status(t, member.c.Do("GET", "/api/stock/"+foreign, nil), 404)
	status(t, member.c.Do("PATCH", "/api/stock/"+foreign, map[string]any{"price": "9"}), 404)
	status(t, member.c.Do("DELETE", "/api/stock/"+foreign, nil), 404)

	photos := "/api/stock/" + w.stock + "/photos"
	added := status(t, uploadImage(t, w.app, member.c, photos, receiptImage(1)), 200)
	photoID := added.Body["photos"].([]any)[0].(map[string]any)["id"].(string)
	status(t, member.c.Do("DELETE", photos+"/"+photoID, nil), 200)
	status(t, uploadImage(t, w.app, member.c, "/api/stock/"+foreign+"/photos", receiptImage(2)), 404)

	material := tradeMaterial(t, w.app, "Paper", "1")
	created := status(t, member.c.Do("POST", "/api/stock", map[string]any{
		"material_id": material, "weight": "5", "price": "2",
	}), 200).Body["id"].(string)
	if got := tradeText(t, w.app, `SELECT owner_id FROM stock WHERE id=$1`, created); got != w.seller.id {
		t.Fatalf("new stock owner = %s", got)
	}
	status(t, member.c.Do("DELETE", "/api/stock/"+created, nil), 200)

	if got := tradeText(t, w.app, `SELECT business_id FROM audit_log WHERE actor_id=$1
		AND table_name='stock' ORDER BY id DESC LIMIT 1`, member.id); got != w.seller.id {
		t.Fatalf("member audit business = %q", got)
	}

	tradeExec(t, w.app, `UPDATE stock SET is_listed=true WHERE id=$1`, foreign)
	tradeExec(t, w.app, `UPDATE businesses SET is_removed=true WHERE id=$1`, w.buyer.id)
	status(t, member.c.Do("GET", "/api/stock/"+foreign, nil), 404)
	status(t, w.seller.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.buyer.id, "items": []map[string]any{{"stock_id": foreign, "weight": "1"}},
	}), 400)
}

func TestTenantRequestsChatRolesAndRemoval(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "member")
	manager := tenantMember(t, w.app, w.seller.id, "manager")
	third := tradeNewUser(t, w.app, "business")
	foreignStock := tradeStock(t, w.app, w.buyer.id, w.material, "20", "8")
	own := tradeRequest(t, w.buyer, w.seller, w.stock)
	foreign := tradeRequest(t, third, w.buyer, foreignStock)

	status(t, member.c.Do("GET", "/api/requests/"+own, nil), 200)
	for _, person := range []tradeUser{member, manager} {
		status(t, person.c.Do("GET", "/api/requests/"+foreign, nil), 404)
		status(t, person.c.Do("GET", "/api/requests/"+foreign+"/messages", nil), 404)
		status(t, person.c.Do("POST", "/api/requests/"+foreign+"/messages", map[string]any{"content": "foreign"}), 404)
	}

	message := status(t, member.c.Do("POST", "/api/requests/"+own+"/messages",
		map[string]any{"content": "A team message"}), 200)
	if got := tradeText(t, w.app, `SELECT sender_id FROM transaction_request_messages WHERE id=$1`, message.Body["id"]); got != member.id {
		t.Fatalf("chat author = %q", got)
	}
	status(t, member.c.Do("POST", "/api/requests/"+own+"/messages/read", nil), 200)

	for _, action := range []string{"offer", "accept", "decline", "withdraw", "reject", "cancel"} {
		status(t, member.c.Do("POST", "/api/requests/"+own+"/"+action, nil), 403)
	}
	status(t, member.c.Do("POST", "/api/requests", map[string]any{"seller_id": w.buyer.id}), 403)
	status(t, member.c.Do("PUT", "/api/cart?seller_id="+w.buyer.id, map[string]any{"items": []any{}}), 403)

	terms := map[string]any{"items": []map[string]any{tradeLine(w.material, "2", "8")}}
	status(t, manager.c.Do("POST", "/api/requests/"+foreign+"/offer", terms), 404)
	status(t, manager.c.Do("POST", "/api/requests/"+own+"/offer", terms), 200)
	status(t, member.c.Do("POST", "/api/requests/"+own+"/accept", nil), 403)

	inbox := status(t, member.c.Do("GET", "/api/messages/inbox", nil), 200)
	if !bytes.Contains(inbox.Raw, []byte(own)) || bytes.Contains(inbox.Raw, []byte(foreign)) {
		t.Fatalf("team inbox scope: %s", inbox.Raw)
	}

	tradeExec(t, w.app, `DELETE FROM business_members WHERE business_id=$1 AND user_id=$2`, w.seller.id, member.id)
	status(t, member.c.Do("GET", "/api/requests/"+own, nil), 404)
	status(t, member.c.Do("GET", "/api/requests/"+own+"/messages", nil), 404)
	status(t, member.c.Do("POST", "/api/requests/"+own+"/messages", map[string]any{"content": "removed"}), 404)
	status(t, member.c.Do("PATCH", "/api/stock/"+w.stock, map[string]any{"price": "10"}), 403)
}

func TestTenantTransactionsExportsReviewsAndDashboard(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "member")
	manager := tenantMember(t, w.app, w.seller.id, "manager")
	third := tradeNewUser(t, w.app, "business")
	tradeStock(t, w.app, w.buyer.id, w.material, "20", "8")
	own := tradeSale(t, w.seller, w.buyer, w.material, "2", "8")
	foreign := tradeSale(t, w.buyer, third, w.material, "2", "8")
	purchase := tradeSale(t, w.buyer, w.seller, w.material, "2", "8")

	status(t, member.c.Do("GET", "/api/transactions/"+own, nil), 200)
	for _, person := range []tradeUser{member, manager} {
		status(t, person.c.Do("GET", "/api/transactions/"+foreign, nil), 404)
		status(t, person.c.Do("GET", "/api/transactions/"+foreign+"/invoice", nil), 404)
		status(t, person.c.Do("GET", "/api/transactions/"+foreign+"/receipts/missing", nil), 404)
		status(t, person.c.Do("DELETE", "/api/transactions/"+foreign+"/receipts/missing", nil), 404)
	}

	status(t, member.c.Do("POST", "/api/transactions/sales", map[string]any{}), 403)
	status(t, member.c.Do("POST", "/api/transactions/collections", map[string]any{}), 403)
	status(t, member.c.Do("GET", "/api/exports/sales", nil), 403)
	status(t, member.c.Do("POST", "/api/transactions/"+purchase+"/review", map[string]any{"rating": 5}), 403)
	status(t, manager.c.Do("POST", "/api/transactions/"+foreign+"/review", map[string]any{"rating": 5}), 404)
	status(t, manager.c.Do("POST", "/api/transactions/"+purchase+"/review", map[string]any{"rating": 5}), 200)

	export := status(t, manager.c.Do("GET", "/api/exports/sales?business_id="+w.buyer.id, nil), 200)
	if !bytes.Contains(export.Raw, []byte(own)) || bytes.Contains(export.Raw, []byte(foreign)) {
		t.Fatalf("export escaped active business: %s", export.Raw)
	}
	page := status(t, member.c.Do("GET", "/api/transactions/sales", nil), 200)
	if !bytes.Contains(page.Raw, []byte(own)) || bytes.Contains(page.Raw, []byte(foreign)) {
		t.Fatalf("sales escaped active business: %s", page.Raw)
	}
	status(t, member.c.Do("GET", "/api/dashboard/business", nil), 200)
}
