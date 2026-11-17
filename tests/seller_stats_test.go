package tests

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	statsstore "github.com/connor-davis/3reco/internal/stores/stats"
	"github.com/connor-davis/3reco/tests/testutil"
)

func sellerStats(t *testing.T, person tradeUser) statsstore.SellerStats {
	t.Helper()
	res := person.c.Do("GET", "/api/stats/seller", nil)
	tradeWant(t, "seller stats", res, 200)
	var result statsstore.SellerStats
	if err := json.Unmarshal(res.Raw, &result); err != nil {
		t.Fatal(err)
	}

	return result
}

func TestSellerStatsViews(t *testing.T) {
	app := testutil.Server(t)
	seller := tradeNewUser(t, app, "business")
	viewer := tradeNewUser(t, app, "business")
	material := tradeMaterial(t, app, "Seller views", "2")
	stock := tradeStock(t, app, seller.id, material, "100", "2")
	path := "/api/market/listings/" + stock

	for i := 0; i < 3; i++ {
		res := viewer.c.Do("GET", path, nil)
		tradeWant(t, "visible listing", res, 200)
		assertSellerPublic(t, res.Body, false)
	}

	if got := sellerStats(t, seller); got.Views.Lifetime != 1 {
		t.Fatalf("refresh counted more than once: %+v", got)
	}

	// Moving the old day simulates crossing local midnight without changing the clock.
	tradeExec(t, app, `UPDATE listing_views SET day=day-1 WHERE stock_id=$1`, stock)
	tradeWant(t, "next day", viewer.c.Do("GET", path, nil), 200)
	if got := sellerStats(t, seller); got.Views.Lifetime != 2 {
		t.Fatalf("next day did not count: %+v", got)
	}

	for _, age := range []int{6, 7, 29, 30, 60} {
		tradeExec(t, app, `INSERT INTO listing_views VALUES
			($1,$2,(now() AT TIME ZONE 'Africa/Johannesburg')::date-$3::int)`,
			stock, viewer.id, age)
	}

	got := sellerStats(t, seller)
	if got.Views != (statsstore.ViewCounts{Days7: 3, Days30: 5, Lifetime: 7}) {
		t.Fatalf("day windows: %+v", got)
	}
	if len(got.Listings) != 1 || got.Listings[0].Views != got.Views {
		t.Fatalf("per-listing counts: %+v", got)
	}

	// The ownership path starts with stock.owner_id and uses stock/day aggregation.
	plan := tradeText(t, app, `EXPLAIN SELECT count(*) FROM stock s
		JOIN listing_views v ON v.stock_id=s.id WHERE s.owner_id=$1`, seller.id)
	t.Logf("owner aggregate query plan: %s", plan)

	tradeExec(t, app, `DELETE FROM stock WHERE id=$1`, stock)
	if count := tradeText(t, app, `SELECT count(*)::text FROM listing_views`); count != "0" {
		t.Fatalf("deleted stock kept views: %s", count)
	}
}

func TestSellerStatsExcludedViewsAndAccess(t *testing.T) {
	app := testutil.Server(t)
	seller := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")
	collector := tradeNewUser(t, app, "collector")
	material := tradeMaterial(t, app, "Private views", "2")
	stock := tradeStock(t, app, seller.id, material, "100", "2")
	path := "/api/market/listings/" + stock
	anon := app.NewClient(t)
	tradeWant(t, "anonymous listing", anon.Do("GET", path, nil), 200)
	tradeWant(t, "own listing", seller.c.Do("GET", path, nil), 200)

	for _, role := range []string{"owner", "manager", "member"} {
		member := tenantMember(t, app, seller.id, role)
		// Team exclusion must work even when the seller is not their active workspace.
		tradeBusiness(t, app, member.id, "Other workspace", true)
		tradeExec(t, app, `UPDATE sessions SET active_business_id=$2 WHERE user_id=$1`, member.id, member.id)
		tradeWant(t, "team view", member.c.Do("GET", path, nil), 200)
		tradeExec(t, app, `UPDATE sessions SET active_business_id=$2 WHERE user_id=$1`, member.id, seller.id)
		tradeWant(t, "team stats", member.c.Do("GET", "/api/stats/seller", nil), 200)
	}

	for _, role := range []string{"admin", "staff"} {
		person := tradeNewUser(t, app, role)
		tradeWant(t, "platform staff view", person.c.Do("GET", path, nil), 200)
		tradeWant(t, "staff without business", person.c.Do("GET", "/api/stats/seller", nil), 403)
	}

	tradeExec(t, app, `UPDATE stock SET is_listed=false WHERE id=$1`, stock)
	tradeWant(t, "hidden listing", other.c.Do("GET", path, nil), 404)
	tradeExec(t, app, `UPDATE stock SET is_listed=true WHERE id=$1`, stock)
	tradeUnverify(t, app, seller)
	tradeWant(t, "unverified listing", other.c.Do("GET", path, nil), 404)
	tradeWant(t, "own unverified listing", seller.c.Do("GET", path, nil), 200)
	tradeExec(t, app, `UPDATE businesses SET business_verified_at=now() WHERE id=$1`, seller.id)

	tradeWant(t, "block", other.c.Do("PUT", "/api/blocks/"+seller.id, nil), 200)
	tradeWant(t, "blocked listing", other.c.Do("GET", path, nil), 404)
	tradeExec(t, app, `UPDATE businesses SET suspended_at=now() WHERE id=$1`, seller.id)
	tradeWant(t, "suspended listing", collector.c.Do("GET", path, nil), 404)

	if got := sellerStats(t, seller); got.Views.Lifetime != 0 {
		t.Fatalf("excluded viewers counted: %+v", got)
	}
	tradeWant(t, "collector stats", collector.c.Do("GET", "/api/stats/seller", nil), 403)
	guest := tradeNewUser(t, app, "guest")
	tradeWant(t, "guest stats", guest.c.Do("GET", "/api/stats/seller", nil), 403)
	tradeWant(t, "anonymous stats", anon.Do("GET", "/api/stats/seller", nil), 401)

	// Supplying another party through a query parameter never changes the scope.
	tradeExec(t, app, `INSERT INTO listing_views VALUES
		($1,$2,(now() AT TIME ZONE 'Africa/Johannesburg')::date)`, stock, collector.id)
	res := other.c.Do("GET", "/api/stats/seller?seller_id="+seller.id, nil)
	tradeWant(t, "own scope despite other seller parameter", res, 200)
	if res.Body["views"].(map[string]any)["lifetime"] != float64(0) {
		t.Fatalf("another party's views leaked: %s", res.Raw)
	}
}

func sellerStatsRequest(t *testing.T, app *testutil.App, seller, buyer string) string {
	t.Helper()
	id := database.NewID()
	tradeExec(t, app, `INSERT INTO transaction_requests(id,seller_id,buyer_id,status,created_at)
		VALUES($1,$2,$3,'pending',now()-interval '3 days')`, id, seller, buyer)
	return id
}

func sellerStatsMessage(
	t *testing.T, app *testutil.App, request, sender string, hours int, system, humanActor bool,
) {
	t.Helper()
	ctx := context.Background()
	if humanActor {
		ctx = database.WithActor(ctx, sender)
	}

	err := app.DB.InTx(ctx, func(ctx context.Context) error {
		_, err := app.DB.Q(ctx).Exec(ctx, `INSERT INTO transaction_request_messages
			(id,request_id,sender_id,content,system,created_at)
			SELECT $1,id,$3,'Reply event',$4,created_at+make_interval(hours=>$5)
			FROM transaction_requests WHERE id=$2`, database.NewID(), request, sender, system, hours)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
}

func assertSellerPublic(t *testing.T, body map[string]any, badge bool) {
	t.Helper()
	if value, ok := body["usually_replies_within_day"].(bool); !ok || value != badge {
		t.Fatalf("public badge: %+v, want %v", body, badge)
	}
	for _, key := range []string{"views", "days_7", "days_30", "lifetime", "replies", "requests", "within_day"} {
		if _, exists := body[key]; exists {
			t.Fatalf("private key %s leaked: %+v", key, body)
		}
	}
}

func TestSellerStatsReplyThresholdsAndActors(t *testing.T) {
	app := testutil.Server(t)
	seller := tradeNewUser(t, app, "business")
	buyer := tradeNewUser(t, app, "business")
	member := tenantMember(t, app, seller.id, "member")
	material := tradeMaterial(t, app, "Reply badge", "2")
	stock := tradeStock(t, app, seller.id, material, "100", "2")
	for i := 0; i < 4; i++ {
		id := sellerStatsRequest(t, app, seller.id, buyer.id)
		// Buyer messages and system events without an actor must not win the minimum.
		sellerStatsMessage(t, app, id, buyer.id, 1, false, true)
		sellerStatsMessage(t, app, id, seller.id, 1, true, false)
		if i < 2 {
			sellerStatsMessage(t, app, id, member.id, 24, false, true)
		} else {
			sellerStatsMessage(t, app, id, seller.id, 25, false, true)
		}
	}

	anon := app.NewClient(t)
	listingPath := "/api/market/listings/" + stock
	assertSellerPublic(t, anon.Do("GET", listingPath, nil).Body, false)
	if got := sellerStats(t, seller).Replies; got.Requests != 4 || got.WithinDay != 2 {
		t.Fatalf("four requests, two human fast replies: %+v", got)
	}

	id := sellerStatsRequest(t, app, seller.id, buyer.id)
	// A seller's human action event qualifies even though system=true.
	sellerStatsMessage(t, app, id, member.id, 2, true, true)
	sellerStatsMessage(t, app, id, member.id, 50, false, true)
	assertSellerPublic(t, anon.Do("GET", listingPath, nil).Body, true)
	assertSellerPublic(t, anon.Do("GET", "/api/stores/"+seller.id, nil).Body, true)
	if got := sellerStats(t, member).Replies; got.Requests != 5 || got.WithinDay != 3 {
		t.Fatalf("five requests with three fast replies: %+v", got)
	}

	tradeExec(t, app, `UPDATE transaction_request_messages SET created_at=(
		SELECT created_at+interval '25 hours' FROM transaction_requests WHERE id=$1)
		WHERE request_id=$1 AND sender_id=$2`, id, member.id)
	assertSellerPublic(t, anon.Do("GET", listingPath, nil).Body, false)
	assertSellerPublic(t, anon.Do("GET", "/api/stores/"+seller.id, nil).Body, false)

	// No reply stays in the denominator; old requests leave the 90-day window.
	sellerStatsRequest(t, app, seller.id, buyer.id)
	old := sellerStatsRequest(t, app, seller.id, buyer.id)
	tradeExec(t, app, `UPDATE transaction_requests SET created_at=now()-interval '91 days' WHERE id=$1`, old)
	if got := sellerStats(t, seller).Replies; got.Requests != 6 || got.WithinDay != 2 {
		t.Fatalf("unanswered and old requests: %+v", got)
	}
}

func TestSellerStatsOfferAndRejectEvents(t *testing.T) {
	app := testutil.Server(t)
	seller := tradeNewUser(t, app, "business")
	buyer := tradeNewUser(t, app, "business")
	material := tradeMaterial(t, app, "Seller actions", "2")
	stock := tradeStock(t, app, seller.id, material, "100", "2")
	first := tradeRequest(t, buyer, seller, stock)
	tradeOffer(t, seller, first, material, "1", "2")
	second := tradeRequest(t, buyer, seller, stock)
	tradeWant(t, "seller rejection", seller.c.Do("POST", "/api/requests/"+second+"/reject", nil), 200)
	if got := sellerStats(t, seller).Replies; got.Requests != 2 || got.WithinDay != 2 {
		t.Fatalf("seller offer and rejection must be replies: %+v", got)
	}
}
