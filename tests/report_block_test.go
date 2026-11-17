package tests

import (
	"context"
	"strings"
	"testing"

	stockstore "github.com/connor-davis/3reco/internal/stores/stock"
	"github.com/connor-davis/3reco/tests/testutil"
)

func reportBody(kind, target, reason string) map[string]any {
	return map[string]any{
		"target_kind": kind,
		"target_id":   target,
		"reason":      reason,
		"details":     "Private report details",
	}
}

func reportCreate(t *testing.T, user tradeUser, kind, target, reason string) string {
	t.Helper()

	response := status(t, user.c.Do("POST", "/api/reports", reportBody(kind, target, reason)), 201)

	return response.Body["id"].(string)
}

func reportMissing(t *testing.T, response testutil.Response, id string) {
	t.Helper()

	tradeWant(t, "hidden list", response, 200)

	for _, value := range tradeItems(response) {
		if value.(map[string]any)["id"] == id {
			t.Errorf("blocked item %s is visible: %s", id, response.Raw)
		}
	}
}

func TestReportBlockVisibilityAndContact(t *testing.T) {
	w := newTradeWorld(t)
	otherStock := tradeStock(t, w.app, w.buyer.id, w.material, "20", "5")
	request := tradeRequest(t, w.buyer, w.seller, w.stock)
	cancel := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, request, w.material, "1", "8")
	post := wantedPost(t, w.buyer, w.material)
	tradeWant(t, "old message", w.seller.c.Do("POST", "/api/requests/"+request+"/messages", map[string]any{"content": "Old chat"}), 200)
	sale := tradeSale(t, w.seller, w.buyer, w.material, "1", "8")

	tradeWant(t, "self block", w.buyer.c.Do("PUT", "/api/blocks/"+w.buyer.id, nil), 400)
	tradeWant(t, "missing target", w.buyer.c.Do("PUT", "/api/blocks/missing", nil), 404)
	tradeWant(t, "block", w.buyer.c.Do("PUT", "/api/blocks/"+w.seller.id, nil), 200)
	tradeWant(t, "block twice", w.buyer.c.Do("PUT", "/api/blocks/"+w.seller.id, nil), 200)
	if got := len(tradeItems(w.buyer.c.Do("GET", "/api/blocks", nil))); got != 1 {
		t.Fatalf("blocks=%d", got)
	}
	if got := len(tradeItems(w.seller.c.Do("GET", "/api/blocks", nil))); got != 0 {
		t.Fatalf("other's blocks leaked: %d", got)
	}

	for _, side := range []struct {
		user, other tradeUser
		stock       string
	}{
		{w.buyer, w.seller, w.stock}, {w.seller, w.buyer, otherStock},
	} {
		reportMissing(t, side.user.c.Do("GET", "/api/market/listings", nil), side.stock)
		reportMissing(t, side.user.c.Do("GET", "/api/stores/"+side.other.id+"/listings", nil), side.stock)
		reportMissing(t, side.user.c.Do("GET", "/api/stores", nil), side.other.id)
		tradeWant(t, "listing detail", side.user.c.Do("GET", "/api/market/listings/"+side.stock, nil), 404)
		tradeWant(t, "store detail", side.user.c.Do("GET", "/api/stores/"+side.other.id, nil), 404)
		tradeWant(t, "new request", side.user.c.Do("POST", "/api/requests", map[string]any{
			"seller_id": side.other.id, "items": []map[string]any{{"stock_id": side.stock, "weight": "1"}},
		}), 403)
		tradeWant(t, "checkout", side.user.c.Do("POST", "/api/requests", map[string]any{
			"seller_id": side.other.id, "from_cart": true,
		}), 403)
		tradeWant(t, "cart", side.user.c.Do("PUT", "/api/cart?seller_id="+side.other.id, map[string]any{
			"items": []map[string]any{{"stock_id": side.stock, "material_id": w.material, "weight": "1"}},
		}), 403)
		tradeWant(t, "message", side.user.c.Do("POST", "/api/requests/"+request+"/messages", map[string]any{"content": "New contact"}), 403)
		tradeWant(t, "offer", side.user.c.Do("POST", "/api/requests/"+request+"/offer", map[string]any{
			"items": []map[string]any{tradeLine(w.material, "1", "8")},
		}), 403)
		tradeWant(t, "accept", side.user.c.Do("POST", "/api/requests/"+request+"/accept", nil), 403)
		tradeWant(t, "follow", side.user.c.Do("PUT", "/api/follows/"+side.other.id, nil), 403)
		tradeWant(t, "old request", side.user.c.Do("GET", "/api/requests/"+request, nil), 200)
		tradeWant(t, "old chat", side.user.c.Do("GET", "/api/requests/"+request+"/messages", nil), 200)
		tradeWant(t, "old trade", side.user.c.Do("GET", "/api/transactions/"+sale, nil), 200)
	}

	reportMissing(t, w.seller.c.Do("GET", "/api/wanted", nil), post)
	tradeWant(t, "wanted reply", wantedReply(w.seller, post, w.material, "2", "8"), 403)
	tradeWant(t, "decline", w.buyer.c.Do("POST", "/api/requests/"+request+"/decline", nil), 200)
	tradeWant(t, "cancel", w.buyer.c.Do("POST", "/api/requests/"+cancel+"/cancel", nil), 200)

	// The other business cannot remove the caller's block.
	tradeWant(t, "other unblock", w.seller.c.Do("DELETE", "/api/blocks/"+w.buyer.id, nil), 200)
	tradeWant(t, "still hidden", w.seller.c.Do("GET", "/api/market/listings/"+otherStock, nil), 404)
	tradeWant(t, "unblock", w.buyer.c.Do("DELETE", "/api/blocks/"+w.seller.id, nil), 200)
	tradeWant(t, "visible again", w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200)
	tradeRequest(t, w.buyer, w.seller, w.stock)
}

func TestReportBlockTeamAndLiveRecipients(t *testing.T) {
	w := newTradeWorld(t)
	member := tradeNewUser(t, w.app, "business")
	stranger := tradeNewUser(t, w.app, "business")
	tradeExec(t, w.app, `INSERT INTO business_members VALUES($1,$2,'member')`, w.buyer.id, member.id)
	status(t, member.c.Do("POST", "/api/businesses/"+w.buyer.id+"/select", nil), 200)
	socks := joinLive(t, w.app, w.buyer, w.seller, member, stranger)

	status(t, w.buyer.c.Do("PUT", "/api/blocks/"+w.seller.id, nil), 200)
	id := tradeText(t, w.app, `SELECT id FROM blocks WHERE blocker_id=$1`, w.buyer.id)
	for _, sock := range socks[:3] {
		sock.hear("block", id)
	}
	socks[3].quiet("unrelated business")

	tradeWant(t, "team listing hidden", member.c.Do("GET", "/api/market/listings/"+w.stock, nil), 404)
	tradeWant(t, "member cannot unblock", member.c.Do("DELETE", "/api/blocks/"+w.seller.id, nil), 403)
	tradeWant(t, "member cannot report", member.c.Do("POST", "/api/reports", reportBody("party", w.seller.id, "spam")), 403)
	if len(tradeItems(member.c.Do("GET", "/api/blocks", nil))) != 1 {
		t.Fatal("team cannot see its blocks")
	}

	tradeExec(t, w.app, `UPDATE business_members SET role='manager' WHERE business_id=$1 AND user_id=$2`, w.buyer.id, member.id)
	requestBody := map[string]any{"seller_id": w.seller.id, "items": []map[string]any{{"stock_id": w.stock, "weight": "1"}}}
	tradeWant(t, "team contact refused", member.c.Do("POST", "/api/requests", requestBody), 403)
	report := reportCreate(t, member, "party", w.seller.id, "spam")
	if actor := tradeText(t, w.app, `SELECT acting_user_id FROM reports WHERE id=$1`, report); actor != member.id {
		t.Errorf("actor=%s", actor)
	}
	tradeWant(t, "team manager unblock", member.c.Do("DELETE", "/api/blocks/"+w.seller.id, nil), 200)
}

func TestReportsValidationAndPrivacy(t *testing.T) {
	w := newTradeWorld(t)
	outsider := tradeNewUser(t, w.app, "business")
	for name, body := range map[string]map[string]any{
		"kind":   reportBody("user", w.seller.id, "spam"),
		"reason": reportBody("party", w.seller.id, "invented"),
		"self":   reportBody("party", w.buyer.id, "spam"),
		"long":   {"target_kind": "party", "target_id": w.seller.id, "reason": "other", "details": strings.Repeat("界", 1001)},
	} {
		tradeWant(t, name, w.buyer.c.Do("POST", "/api/reports", body), 400)
	}
	tradeWant(t, "missing", w.buyer.c.Do("POST", "/api/reports", reportBody("listing", "missing", "spam")), 404)
	tradeWant(t, "anonymous", w.app.NewClient(t).Do("POST", "/api/reports", reportBody("party", w.seller.id, "spam")), 401)
	report := reportCreate(t, w.buyer, "listing", w.stock, "scam")
	tradeWant(t, "duplicate", w.buyer.c.Do("POST", "/api/reports", reportBody("listing", w.stock, "scam")), 409)
	reportCreate(t, w.buyer, "listing", w.stock, "wrong_info")
	reportCreate(t, outsider, "listing", w.stock, "scam")

	mine := status(t, w.buyer.c.Do("GET", "/api/reports", nil), 200)
	if len(tradeItems(mine)) != 2 {
		t.Fatalf("mine=%s", mine.Raw)
	}
	for _, value := range tradeItems(mine) {
		row := value.(map[string]any)
		if len(row) != 2 || row["id"] == nil || row["status"] != "open" {
			t.Errorf("private fields: %v", row)
		}
	}
	if len(tradeItems(w.seller.c.Do("GET", "/api/reports", nil))) != 0 {
		t.Fatal("reported party sees reports")
	}
	for _, user := range []tradeUser{w.buyer, w.seller, outsider, tradeNewUser(t, w.app, "staff")} {
		tradeWant(t, "queue denied", user.c.Do("GET", "/api/admin/reports", nil), 403)
		tradeWant(t, "resolve denied", user.c.Do("POST", "/api/admin/reports/"+report+"/resolve", map[string]any{"action": "dismiss"}), 403)
		tradeWant(t, "unsuspend denied", user.c.Do("POST", "/api/admin/businesses/"+w.seller.id+"/unsuspend", nil), 403)
		tradeWant(t, "private detail denied", user.c.Do("GET", "/api/reports/"+report, nil), 404)
	}
}

func TestReportAdminActionsAuditAndNotices(t *testing.T) {
	for _, action := range []string{"dismiss", "remove_listing", "suspend"} {
		t.Run(action, func(t *testing.T) {
			w := newTradeWorld(t)
			admin := tradeNewUser(t, w.app, "admin")
			report := reportCreate(t, w.buyer, "listing", w.stock, "scam")
			socks := joinLive(t, w.app, w.buyer, w.seller, admin)

			tradeWant(t, "unknown action", admin.c.Do("POST", "/api/admin/reports/"+report+"/resolve", map[string]any{"action": "bad"}), 400)
			status(t, admin.c.Do("POST", "/api/admin/reports/"+report+"/resolve", map[string]any{"action": action}), 200)
			tradeWant(t, "close twice", admin.c.Do("POST", "/api/admin/reports/"+report+"/resolve", map[string]any{"action": action}), 409)
			if got := tradeText(t, w.app, `SELECT count(*)::text FROM audit_log WHERE actor_id=$1
    AND table_name='moderation_action' AND row_key->>'id'=$2 AND new_values->>'action'=$3`, admin.id, report, action); got != "1" {
				t.Errorf("action audit count=%s", got)
			}
			if got := tradeText(t, w.app, `SELECT count(*)::text FROM audit_log WHERE actor_id=$1 AND table_name='reports'
    AND row_key->>'id'=$2 AND action='update'`, admin.id, report); got != "1" {
				t.Errorf("report audit count=%s", got)
			}

			notification := tradeText(t, w.app, `SELECT id FROM notifications WHERE user_id=$1 AND type='report_closed'`, w.buyer.id)
			socks[0].hear("notification", notification)
			body := tradeText(t, w.app, `SELECT body FROM notifications WHERE id=$1`, notification)
			if body != "Thanks, we looked at your report." {
				t.Errorf("notice=%q", body)
			}
			if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications WHERE user_id=$1`, w.seller.id); got != "0" {
				t.Errorf("reported party told: %s", got)
			}

			// Every frame is id-only; no report event is registered at all.
			settle(t, w.app, socks...)
			for _, sock := range socks {
				sock.quiet("report private")
			}

			reportCreate(t, w.buyer, "listing", w.stock, "scam")
			queue := status(t, admin.c.Do("GET", "/api/admin/reports", nil), 200)
			if tradeItems(queue)[0].(map[string]any)["status"] != "open" {
				t.Fatal("queue not open first")
			}
			if action == "remove_listing" {
				if got := tradeText(t, w.app, `SELECT is_listed::text FROM stock WHERE id=$1`, w.stock); got != "false" {
					t.Errorf("listing=%s", got)
				}
			}
		})
	}
}

func TestReportSuspendAndUnsuspend(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	request := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, request, w.material, "1", "8")
	sale := tradeSale(t, w.seller, w.buyer, w.material, "1", "8")
	post := wantedPost(t, w.seller, w.material)
	report := reportCreate(t, w.buyer, "party", w.seller.id, "spam")
	tradeWant(t, "cannot remove party listing", admin.c.Do("POST", "/api/admin/reports/"+report+"/resolve", map[string]any{"action": "remove_listing"}), 400)
	status(t, admin.c.Do("POST", "/api/admin/reports/"+report+"/resolve", map[string]any{"action": "suspend"}), 200)

	tradeWant(t, "signed in", w.seller.c.Do("GET", "/api/auth/me", nil), 200)
	tradeWant(t, "new sign in", signIn(t, w.app.NewClient(t), w.seller.email, goodPassword), 200)
	reportMissing(t, w.buyer.c.Do("GET", "/api/market/listings", nil), w.stock)
	reportMissing(t, w.app.NewClient(t).Do("GET", "/api/market/listings", nil), w.stock)
	reportMissing(t, w.buyer.c.Do("GET", "/api/wanted", nil), post)
	tradeWant(t, "listing", w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 404)
	tradeWant(t, "store", w.buyer.c.Do("GET", "/api/stores/"+w.seller.id, nil), 404)
	for _, side := range []tradeUser{w.buyer, w.seller} {
		tradeWant(t, "old trade", side.c.Do("GET", "/api/transactions/"+sale, nil), 200)
		tradeWant(t, "old chat", side.c.Do("GET", "/api/requests/"+request+"/messages", nil), 200)
		tradeWant(t, "suspended send", side.c.Do("POST", "/api/requests/"+request+"/messages", map[string]any{"content": "new"}), 403)
		tradeWant(t, "suspended accept", side.c.Do("POST", "/api/requests/"+request+"/accept", nil), 403)
		tradeWant(t, "suspended offer", side.c.Do("POST", "/api/requests/"+request+"/offer", map[string]any{"items": []map[string]any{tradeLine(w.material, "1", "8")}}), 403)
	}
	tradeWant(t, "suspended create", w.buyer.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.seller.id, "items": []map[string]any{{"stock_id": w.stock, "weight": "1"}},
	}), 403)
	tradeWant(t, "suspended follow", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 403)
	tradeWant(t, "suspended wanted reply", wantedReply(w.buyer, post, w.material, "1", "8"), 403)
	tradeWant(t, "withdraw still works", w.seller.c.Do("POST", "/api/requests/"+request+"/withdraw", nil), 200)
	status(t, admin.c.Do("POST", "/api/admin/businesses/"+w.seller.id+"/unsuspend", nil), 200)
	tradeWant(t, "visible again", w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200)
	tradeWant(t, "can message again", w.buyer.c.Do("POST", "/api/requests/"+request+"/messages", map[string]any{"content": "restored"}), 200)
	tradeRequest(t, w.buyer, w.seller, w.stock)
	if got := tradeText(t, w.app, `SELECT count(*)::text FROM audit_log WHERE actor_id=$1
  AND table_name='moderation_action' AND new_values->>'action'='unsuspend'`, admin.id); got != "1" {
		t.Errorf("unsuspend audit=%s", got)
	}
}

func TestReportSurvivesListingDeletion(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	report := reportCreate(t, w.buyer, "listing", w.stock, "spam")

	// Moderation history must not break the stock owner's ordinary delete.
	status(t, w.seller.c.Do("DELETE", "/api/stock/"+w.stock, nil), 200)
	if got := tradeText(t, w.app, `SELECT target_id FROM reports WHERE id=$1`, report); got != w.stock {
		t.Fatalf("report lost its target: %s", got)
	}

	status(t, admin.c.Do(
		"POST",
		"/api/admin/reports/"+report+"/resolve",
		map[string]any{"action": "dismiss"},
	), 200)
}

func TestReportBlockAlertsSkipWholeTeam(t *testing.T) {
	w := newTradeWorld(t)
	member := tradeNewUser(t, w.app, "business")
	outsider := tradeNewUser(t, w.app, "business")
	tradeExec(t, w.app, `INSERT INTO business_members VALUES($1,$2,'member')`, w.buyer.id, member.id)
	for _, person := range []tradeUser{w.buyer, member, outsider} {
		status(t, person.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)
		status(t, person.c.Do("POST", "/api/saved-searches", map[string]any{"material_id": w.material}), 201)
	}
	status(t, w.buyer.c.Do("PUT", "/api/blocks/"+w.seller.id, nil), 200)
	// The member still has their own business selected. Personal alerts must
	// nevertheless respect the other business they belong to.
	status(t, w.seller.c.Do("POST", "/api/stock", map[string]any{
		"material_id": w.material, "weight": "5", "price": "8", "is_listed": true,
	}), 200)
	records := stockstore.New(w.app.DB)
	if err := records.TellImport(context.Background(), w.seller.id, []string{w.stock}); err != nil {
		t.Fatal(err)
	}
	// Exercise matching-search filtering too, without follower deduplication.
	tradeExec(t, w.app, `DELETE FROM follows`)
	if err := records.TellSearchers(context.Background(), w.stock); err != nil {
		t.Fatal(err)
	}
	if err := records.TellImport(context.Background(), w.seller.id, []string{w.stock}); err != nil {
		t.Fatal(err)
	}

	for _, person := range []tradeUser{w.buyer, member} {
		if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications WHERE user_id=$1`, person.id); got != "0" {
			t.Errorf("blocked person %s got %s alerts", person.id, got)
		}
	}
	if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications WHERE user_id=$1`, outsider.id); got != "4" {
		t.Errorf("outsider alerts=%s, want 4", got)
	}
}
