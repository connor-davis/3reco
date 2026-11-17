package tests

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/tests/testutil"
)

// wantedWorld is a buyer, two verified sellers with listed stock of the same
// material, and an open post for 40.50 kg of it.
type wantedWorld struct {
	app              *testutil.App
	buyer            tradeUser
	sellerA, sellerB tradeUser
	material         string
	stockA, stockB   string
	post             string
}

func newWantedWorld(t *testing.T) wantedWorld {
	t.Helper()

	app := testutil.Server(t)
	w := wantedWorld{
		app:     app,
		buyer:   tradeNewUser(t, app, "business"),
		sellerA: tradeNewUser(t, app, "business"),
		sellerB: tradeNewUser(t, app, "business"),
	}

	w.material = tradeMaterial(t, app, "Glass", "5")
	w.stockA = tradeStock(t, app, w.sellerA.id, w.material, "100", "8")
	w.stockB = tradeStock(t, app, w.sellerB.id, w.material, "100", "8")
	w.post = wantedPost(t, w.buyer, w.material)

	return w
}

func wantedBody(material string) map[string]any {
	return map[string]any{
		"material_id": material, "weight": "40.50", "max_price": "12.50",
		"area": "Pretoria, Gauteng", "days": 7,
	}
}

func wantedPost(t *testing.T, buyer tradeUser, material string) string {
	t.Helper()

	res := buyer.c.Do("POST", "/api/wanted", wantedBody(material))
	if res.Status != 200 {
		t.Fatalf("create wanted post: %d %s", res.Status, res.Raw)
	}

	return res.Body["id"].(string)
}

func wantedReply(seller tradeUser, post, material, weight, price string) testutil.Response {
	return seller.c.Do("POST", "/api/wanted/"+post+"/replies", map[string]any{
		"items": []map[string]any{tradeLine(material, weight, price)},
	})
}

// wantedReplyOK replies and returns the request the reply opened.
func wantedReplyOK(t *testing.T, seller tradeUser, post, material, weight, price string) string {
	t.Helper()

	res := wantedReply(seller, post, material, weight, price)
	if res.Status != 200 {
		t.Fatalf("reply: %d %s", res.Status, res.Raw)
	}

	return res.Body["id"].(string)
}

func wantedActiveHolds(t *testing.T, w wantedWorld, request string) string {
	t.Helper()

	return tradeText(t, w.app, `SELECT count(*)::text FROM stock_holds
		WHERE request_id = $1 AND status = 'active'`, request)
}

func wantedKinds(t *testing.T, w wantedWorld, user tradeUser) string {
	t.Helper()

	return tradeText(t, w.app, `SELECT string_agg(type, ',' ORDER BY type)
		FROM notifications WHERE user_id = $1`, user.id)
}

func TestWantedCreateValidationAndExactDecimals(t *testing.T) {
	w := newWantedWorld(t)

	bad := map[string]map[string]any{
		"no material":      {"material_id": "", "weight": "5", "area": "Cape Town", "days": 7},
		"unknown material": {"material_id": "nope", "weight": "5", "area": "Cape Town", "days": 7},
		"zero weight":      {"material_id": w.material, "weight": "0", "area": "Cape Town", "days": 7},
		"three decimals":   {"material_id": w.material, "weight": "1.234", "area": "Cape Town", "days": 7},
		"float weight":     {"material_id": w.material, "weight": "1e3", "area": "Cape Town", "days": 7},
		"bad price":        {"material_id": w.material, "weight": "5", "max_price": "abc", "area": "Cape Town", "days": 7},
		"three price dec":  {"material_id": w.material, "weight": "5", "max_price": "1.005", "area": "Cape Town", "days": 7},
		"empty area":       {"material_id": w.material, "weight": "5", "area": "   ", "days": 7},
		"long area":        {"material_id": w.material, "weight": "5", "area": strings.Repeat("a", 121), "days": 7},
		"odd days":         {"material_id": w.material, "weight": "5", "area": "Cape Town", "days": 5},
		"no days":          {"material_id": w.material, "weight": "5", "area": "Cape Town"},
	}

	for name, body := range bad {
		tradeWant(t, name, w.buyer.c.Do("POST", "/api/wanted", body), 400)
	}

	// Exactly the typed decimals come back, and an empty price means "any".
	tradeWant(t, "any price", w.buyer.c.Do("POST", "/api/wanted", map[string]any{
		"material_id": w.material, "weight": "7", "area": " Durban ", "days": 30,
	}), 200)

	mine := w.buyer.c.Do("GET", "/api/wanted/mine", nil)
	tradeWant(t, "mine", mine, 200)

	var exact, anyPrice map[string]any

	for _, row := range tradeItems(mine) {
		post := row.(map[string]any)

		if post["id"] == w.post {
			exact = post
		} else {
			anyPrice = post
		}
	}

	if exact["weight"] != "40.50" || exact["max_price"] != "12.50" || exact["area"] != "Pretoria, Gauteng" {
		t.Errorf("post changed on the way: %v", exact)
	}

	if anyPrice == nil || anyPrice["max_price"] != nil || anyPrice["area"] != "Durban" {
		t.Errorf("post with no price ceiling: %v", anyPrice)
	}

	if exact["status"] != "open" || exact["reply_count"] != float64(0) {
		t.Errorf("new post state: %v", exact)
	}
}

func TestWantedAccess(t *testing.T) {
	w := newWantedWorld(t)
	unverified := tradeNewUnverified(t, w.app)
	collector := tradeNewUser(t, w.app, "collector")
	guest, _ := newGuest(t, w.app)
	signedOut := w.app.NewClient(t)

	// Unverified business: may post, may not browse or reply.
	tradeWant(t, "unverified posts", unverified.c.Do("POST", "/api/wanted", wantedBody(w.material)), 200)
	tradeWant(t, "unverified browses", unverified.c.Do("GET", "/api/wanted", nil), 403)
	tradeWant(t, "unverified replies", wantedReply(unverified, w.post, w.material, "10", "9"), 403)

	for name, c := range map[string]*testutil.Client{
		"collector": collector.c, "guest": guest,
	} {
		tradeWant(t, name+" browses", c.Do("GET", "/api/wanted", nil), 403)
		tradeWant(t, name+" posts", c.Do("POST", "/api/wanted", wantedBody(w.material)), 403)
		tradeWant(t, name+" lists own", c.Do("GET", "/api/wanted/mine", nil), 403)
		tradeWant(t, name+" replies", c.Do("POST", "/api/wanted/"+w.post+"/replies", map[string]any{
			"items": []map[string]any{tradeLine(w.material, "10", "9")},
		}), 403)
	}

	tradeWant(t, "signed out browses", signedOut.Do("GET", "/api/wanted", nil), 401)
	tradeWant(t, "signed out posts", signedOut.Do("POST", "/api/wanted", wantedBody(w.material)), 401)
	tradeWant(t, "signed out replies", signedOut.Do("POST", "/api/wanted/"+w.post+"/replies", nil), 401)

	// A team member below manager cannot post or browse either.
	tradeExec(t, w.app, `UPDATE business_members SET role = 'member' WHERE business_id = $1`, w.sellerB.id)
	tradeWant(t, "member browses", w.sellerB.c.Do("GET", "/api/wanted", nil), 403)
}

func TestWantedDiscoveryNeverShowsTheBuyer(t *testing.T) {
	w := newWantedWorld(t)

	// Give the buyer an address and a map point so a leak would show.
	tradeExec(t, w.app, `UPDATE businesses SET street_address = '12 Secret Street',
		city = 'Secretville', latitude = -25.7, longitude = 28.2 WHERE id = $1`, w.buyer.id)

	res := w.sellerA.c.Do("GET", "/api/wanted", nil)
	tradeWant(t, "discover", res, 200)

	rows := tradeItems(res)
	if len(rows) != 1 {
		t.Fatalf("discovery: %d posts, want 1: %s", len(rows), res.Raw)
	}

	allowed := map[string]bool{
		"id": true, "material_id": true, "material_name": true, "weight": true, "max_price": true,
		"area": true, "status": true, "expires_at": true, "created_at": true, "reply_count": true,
		"my_request_id": true,
	}

	post := rows[0].(map[string]any)
	for key := range post {
		if !allowed[key] {
			t.Errorf("discovery post has an unexpected field %q", key)
		}
	}

	if post["weight"] != "40.50" || post["max_price"] != "12.50" || post["area"] != "Pretoria, Gauteng" {
		t.Errorf("post fields: %v", post)
	}

	for _, secret := range []string{
		w.buyer.id, "Biz " + w.buyer.id[:6], "Secret Street", "Secretville", "-25.7", "28.2",
	} {
		if strings.Contains(string(res.Raw), secret) {
			t.Errorf("discovery leaks %q: %s", secret, res.Raw)
		}
	}

	// The buyer does not find their own post among the others.
	own := w.buyer.c.Do("GET", "/api/wanted", nil)
	tradeWant(t, "buyer discovers", own, 200)

	if n := len(tradeItems(own)); n != 0 {
		t.Errorf("buyer sees %d of their own posts in discovery", n)
	}

	// Filtering by another material finds nothing.
	other := tradeMaterial(t, w.app, "Tin", "5")
	filtered := w.sellerA.c.Do("GET", "/api/wanted?material_id="+other, nil)
	tradeWant(t, "filter", filtered, 200)

	if n := len(tradeItems(filtered)); n != 0 {
		t.Errorf("filter let %d posts through", n)
	}
}

func TestWantedReplyRules(t *testing.T) {
	w := newWantedWorld(t)

	tradeWant(t, "own post", wantedReply(w.buyer, w.post, w.material, "10", "9"), 403)
	tradeWant(t, "unknown post", wantedReply(w.sellerA, "nope", w.material, "10", "9"), 404)

	tin := tradeMaterial(t, w.app, "Tin", "5")
	tradeWant(t, "wrong material", wantedReply(w.sellerA, w.post, tin, "10", "9"), 400)
	tradeWant(t, "price above ceiling", wantedReply(w.sellerA, w.post, w.material, "10", "12.51"), 400)
	tradeWant(t, "zero price", wantedReply(w.sellerA, w.post, w.material, "10", "0"), 400)
	tradeWant(t, "float weight", wantedReply(w.sellerA, w.post, w.material, "1.234", "9"), 400)
	tradeWant(t, "two lines", w.sellerA.c.Do("POST", "/api/wanted/"+w.post+"/replies", map[string]any{
		"items": []map[string]any{tradeLine(w.material, "1", "9"), tradeLine(tin, "1", "9")},
	}), 400)
	tradeWant(t, "no lines", w.sellerA.c.Do("POST", "/api/wanted/"+w.post+"/replies",
		map[string]any{"items": []map[string]any{}}), 400)

	// A reply needs real listed stock that can be held, like any offer.
	noStock := tradeNewUser(t, w.app, "business")
	tradeWant(t, "no stock", wantedReply(noStock, w.post, w.material, "10", "9"), 409)

	unlisted := tradeNewUser(t, w.app, "business")
	stock := tradeStock(t, w.app, unlisted.id, w.material, "100", "8")
	tradeExec(t, w.app, `UPDATE stock SET is_listed = false WHERE id = $1`, stock)
	tradeWant(t, "unlisted stock", wantedReply(unlisted, w.post, w.material, "10", "9"), 409)
	tradeWant(t, "too heavy", wantedReply(w.sellerA, w.post, w.material, "101", "9"), 409)

	if n := tradeText(t, w.app, `SELECT count(*)::text FROM transaction_requests
		WHERE wanted_post_id = $1`, w.post); n != "0" {
		t.Fatalf("refused replies left %s requests behind", n)
	}

	// The real reply.
	id := wantedReplyOK(t, w.sellerA, w.post, w.material, "40", "9.50")

	got := w.buyer.c.Do("GET", "/api/requests/"+id, nil)
	tradeWant(t, "buyer reads the reply", got, 200)

	if got.Body["status"] != "offered" || got.Body["wanted_post_id"] != w.post ||
		got.Body["offer_by"] != w.sellerA.id {
		t.Errorf("reply request: %s", got.Raw)
	}

	if buyer := got.Body["buyer"].(map[string]any); buyer["id"] != w.buyer.id {
		t.Errorf("reply buyer is %v, want the post's buyer", buyer["id"])
	}

	if holds := wantedActiveHolds(t, w, id); holds != "1" {
		t.Errorf("reply holds %s stock rows, want 1", holds)
	}

	if kinds := wantedKinds(t, w, w.buyer); kinds != "request_received" {
		t.Errorf("buyer notifications %q, want request_received", kinds)
	}

	// One reply per seller.
	tradeWant(t, "second reply", wantedReply(w.sellerA, w.post, w.material, "10", "9"), 409)

	// Discovery now tells that seller they replied, and the buyer counts it.
	seen := w.sellerA.c.Do("GET", "/api/wanted", nil)
	if row := tradeItems(seen)[0].(map[string]any); row["my_request_id"] != id {
		t.Errorf("discovery does not point at the reply: %v", row)
	}

	mine := w.buyer.c.Do("GET", "/api/wanted/mine", nil)
	if row := tradeItems(mine)[0].(map[string]any); row["reply_count"] != float64(1) {
		t.Errorf("reply count: %v", row)
	}

	replies := w.buyer.c.Do("GET", "/api/wanted/"+w.post+"/replies", nil)
	tradeWant(t, "replies", replies, 200)

	if rows := tradeItems(replies); len(rows) != 1 || rows[0].(map[string]any)["request_id"] != id {
		t.Errorf("replies: %s", replies.Raw)
	}
}

func TestWantedOtherPeopleCannotCloseOrReadReplies(t *testing.T) {
	w := newWantedWorld(t)
	id := wantedReplyOK(t, w.sellerA, w.post, w.material, "10", "9")
	stranger := tradeNewUser(t, w.app, "business")

	for name, user := range map[string]tradeUser{"stranger": stranger, "replier": w.sellerA} {
		tradeWant(t, name+" reads replies", user.c.Do("GET", "/api/wanted/"+w.post+"/replies", nil), 404)
		tradeWant(t, name+" closes", user.c.Do("POST", "/api/wanted/"+w.post+"/close", nil), 404)
	}

	// Another business's reply request is private to its two sides too.
	tradeWant(t, "stranger reads the reply", stranger.c.Do("GET", "/api/requests/"+id, nil), 404)

	if got := tradeText(t, w.app, `SELECT status FROM wanted_posts WHERE id = $1`, w.post); got != "open" {
		t.Errorf("post status %q after refused closes, want open", got)
	}

	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id = $1`, id); got != "offered" {
		t.Errorf("reply status %q after refused closes, want offered", got)
	}
}

func TestWantedWinnerFillsPostAndCancelsTheRest(t *testing.T) {
	w := newWantedWorld(t)
	first := wantedReplyOK(t, w.sellerA, w.post, w.material, "40", "9")
	second := wantedReplyOK(t, w.sellerB, w.post, w.material, "30", "10")

	for _, id := range []string{first, second} {
		if holds := wantedActiveHolds(t, w, id); holds != "1" {
			t.Fatalf("request %s holds %s, want 1", id, holds)
		}
	}

	// Each reply is its own chat with the ordinary two-party accept.
	tradeWant(t, "buyer accepts", w.buyer.c.Do("POST", "/api/requests/"+first+"/accept", nil), 200)

	if got := tradeText(t, w.app, `SELECT status FROM wanted_posts WHERE id = $1`, w.post); got != "open" {
		t.Fatalf("post is %q before both sides confirmed, want open", got)
	}

	done := w.sellerA.c.Do("POST", "/api/requests/"+first+"/accept", nil)
	tradeWant(t, "seller confirms", done, 200)

	if done.Body["transaction_id"] == "" {
		t.Fatalf("no transaction: %s", done.Raw)
	}

	if got := tradeText(t, w.app, `SELECT status FROM wanted_posts WHERE id = $1`, w.post); got != "filled" {
		t.Errorf("post is %q, want filled", got)
	}

	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id = $1`, second); got != "cancelled" {
		t.Errorf("other reply is %q, want cancelled", got)
	}

	if holds := wantedActiveHolds(t, w, second); holds != "0" {
		t.Errorf("cancelled reply still holds %s rows", holds)
	}

	left := tradeText(t, w.app, `SELECT count(*)::text FROM transaction_request_items
		WHERE request_id = $1 AND (offer_weight IS NOT NULL OR offer_price IS NOT NULL)`, second)
	if left != "0" {
		t.Errorf("cancelled reply keeps %s offer lines", left)
	}

	// The loser is told, and the chat records why.
	if kinds := wantedKinds(t, w, w.sellerB); !strings.Contains(kinds, "request_cancelled") {
		t.Errorf("losing seller notifications %q, want request_cancelled", kinds)
	}

	events := tradeText(t, w.app, `SELECT count(*)::text FROM transaction_request_messages
		WHERE request_id = $1 AND system AND content LIKE '%chose another reply%'`, second)
	if events != "1" {
		t.Errorf("chat has %s cancel events, want 1", events)
	}

	// The winner's stock moved, the loser's did not.
	if got := tradeStockWeight(t, w.app, w.sellerA.id, w.material); got != "60.000000" && got != "60" {
		t.Errorf("winner stock %s, want 60", got)
	}

	if got := tradeStockWeight(t, w.app, w.sellerB.id, w.material); got != "100.000000" && got != "100" {
		t.Errorf("loser stock %s, want 100", got)
	}

	// A filled post takes no more replies and leaves discovery.
	late := tradeNewUser(t, w.app, "business")
	tradeStock(t, w.app, late.id, w.material, "50", "8")
	tradeWant(t, "late reply", wantedReply(late, w.post, w.material, "10", "9"), 409)

	if n := len(tradeItems(late.c.Do("GET", "/api/wanted", nil))); n != 0 {
		t.Errorf("filled post still in discovery (%d)", n)
	}

	// The loser's request is dead: nothing more can be accepted on it.
	tradeWant(t, "accept the loser", w.buyer.c.Do("POST", "/api/requests/"+second+"/accept", nil), 409)
}

func TestWantedCloseCancelsOpenReplies(t *testing.T) {
	w := newWantedWorld(t)
	first := wantedReplyOK(t, w.sellerA, w.post, w.material, "40", "9")
	second := wantedReplyOK(t, w.sellerB, w.post, w.material, "30", "10")

	tradeWant(t, "close", w.buyer.c.Do("POST", "/api/wanted/"+w.post+"/close", nil), 200)

	if got := tradeText(t, w.app, `SELECT status FROM wanted_posts WHERE id = $1`, w.post); got != "closed" {
		t.Errorf("post is %q, want closed", got)
	}

	for _, id := range []string{first, second} {
		if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id = $1`, id); got != "cancelled" {
			t.Errorf("reply %s is %q, want cancelled", id, got)
		}

		if holds := wantedActiveHolds(t, w, id); holds != "0" {
			t.Errorf("reply %s still holds %s rows", id, holds)
		}
	}

	for _, seller := range []tradeUser{w.sellerA, w.sellerB} {
		if kinds := wantedKinds(t, w, seller); !strings.Contains(kinds, "request_cancelled") {
			t.Errorf("seller notifications %q, want request_cancelled", kinds)
		}
	}

	tradeWant(t, "close twice", w.buyer.c.Do("POST", "/api/wanted/"+w.post+"/close", nil), 409)
	tradeWant(t, "reply after close", wantedReply(w.sellerA, w.post, w.material, "10", "9"), 409)

	mine := w.buyer.c.Do("GET", "/api/wanted/mine", nil)
	if row := tradeItems(mine)[0].(map[string]any); row["status"] != "closed" || row["reply_count"] != float64(0) {
		t.Errorf("closed post in my list: %v", row)
	}

	if n := len(tradeItems(w.sellerA.c.Do("GET", "/api/wanted", nil))); n != 0 {
		t.Errorf("closed post still in discovery (%d)", n)
	}
}

func TestWantedExpiredPostIsHiddenAndRefusesReplies(t *testing.T) {
	w := newWantedWorld(t)
	tradeExec(t, w.app, `UPDATE wanted_posts SET expires_at = now() - interval '1 minute'
		WHERE id = $1`, w.post)

	if n := len(tradeItems(w.sellerA.c.Do("GET", "/api/wanted", nil))); n != 0 {
		t.Errorf("expired post in discovery (%d)", n)
	}

	tradeWant(t, "reply to expired", wantedReply(w.sellerA, w.post, w.material, "10", "9"), 409)

	mine := w.buyer.c.Do("GET", "/api/wanted/mine", nil)
	if row := tradeItems(mine)[0].(map[string]any); row["status"] != "expired" {
		t.Errorf("expired post shows as %v", row["status"])
	}

	// The buyer can still tidy it away.
	tradeWant(t, "close expired", w.buyer.c.Do("POST", "/api/wanted/"+w.post+"/close", nil), 200)
}

func TestWantedPostsGoOutLive(t *testing.T) {
	w := newWantedWorld(t)

	conn, err := pgx.Connect(context.Background(), w.app.DB.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(context.Background())

	if _, err := conn.Exec(context.Background(), `LISTEN threereco_changes`); err != nil {
		t.Fatal(err)
	}

	post := wantedPost(t, w.buyer, w.material)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	for {
		note, err := conn.WaitForNotification(ctx)
		if err != nil {
			t.Fatalf("no live event for the new post: %v", err)
		}

		if strings.Contains(note.Payload, `"kind" : "wanted"`) && strings.Contains(note.Payload, post) {
			if strings.Contains(note.Payload, w.buyer.id+`"]`) && !strings.Contains(note.Payload, `"aud" : "all"`) {
				t.Errorf("wanted event misses the open audience: %s", note.Payload)
			}

			return
		}
	}
}
