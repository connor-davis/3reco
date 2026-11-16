package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// favWorld is a seller with one listed item, plus a buyer and a bystander.
type favWorld struct {
	app      *testutil.App
	seller   tradeUser
	buyer    tradeUser
	other    tradeUser
	material string
	listing  string
}

func newFavWorld(t *testing.T) favWorld {
	t.Helper()

	app := testutil.Server(t)
	w := favWorld{
		app:    app,
		seller: tradeNewUser(t, app, "business"),
		buyer:  tradeNewUser(t, app, "business"),
		other:  tradeNewUser(t, app, "business"),
	}

	w.material = domainMaterial(t, app, "Glass", "5")
	w.listing = domainStock(t, w.seller.c, w.material, true)

	return w
}

func favIDs(t *testing.T, u tradeUser, area string) []any {
	t.Helper()

	res := u.c.Do("GET", "/api/"+area+"/ids", nil)
	tradeWant(t, area+" ids", res, 200)

	ids, ok := res.Body["ids"].([]any)
	if !ok {
		t.Fatalf("ids must be an array: %s", res.Raw)
	}

	return ids
}

func storeAlerts(t *testing.T, w favWorld, u tradeUser) string {
	t.Helper()

	return tradeText(t, w.app,
		`SELECT count(*)::text FROM notifications WHERE user_id = $1 AND type = 'store_new_listing'`, u.id)
}

func TestFavouritesCRUD(t *testing.T) {
	w := newFavWorld(t)

	tradeWant(t, "save", w.buyer.c.Do("PUT", "/api/favourites/"+w.listing, nil), 200)
	// Saving again is harmless.
	tradeWant(t, "save twice", w.buyer.c.Do("PUT", "/api/favourites/"+w.listing, nil), 200)

	if ids := favIDs(t, w.buyer, "favourites"); len(ids) != 1 || ids[0] != w.listing {
		t.Fatalf("saved ids %v, want [%s]", ids, w.listing)
	}

	list := w.buyer.c.Do("GET", "/api/favourites", nil)
	tradeWant(t, "list", list, 200)

	if items := pageItems(t, list); len(items) != 1 || items[0]["id"] != w.listing {
		t.Fatalf("saved listings %s", list.Raw)
	}

	tradeWant(t, "remove", w.buyer.c.Do("DELETE", "/api/favourites/"+w.listing, nil), 200)
	tradeWant(t, "remove twice", w.buyer.c.Do("DELETE", "/api/favourites/"+w.listing, nil), 200)

	if ids := favIDs(t, w.buyer, "favourites"); len(ids) != 0 {
		t.Fatalf("saved ids %v after remove, want none", ids)
	}
}

func TestFavouritesAreSignedInOnly(t *testing.T) {
	w := newFavWorld(t)
	anon := w.app.NewClient(t)

	for _, path := range []string{"/api/favourites", "/api/favourites/ids", "/api/follows", "/api/follows/ids"} {
		tradeWant(t, path, anon.Do("GET", path, nil), 401)
	}

	tradeWant(t, "save", anon.Do("PUT", "/api/favourites/"+w.listing, nil), 401)
	tradeWant(t, "follow", anon.Do("PUT", "/api/follows/"+w.seller.id, nil), 401)
}

func TestFavouritesBelongToOnePerson(t *testing.T) {
	w := newFavWorld(t)
	tradeWant(t, "save", w.buyer.c.Do("PUT", "/api/favourites/"+w.listing, nil), 200)
	tradeWant(t, "follow", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)

	// Another person sees none of it.
	if ids := favIDs(t, w.other, "favourites"); len(ids) != 0 {
		t.Errorf("other sees saved ids %v", ids)
	}

	if ids := favIDs(t, w.other, "follows"); len(ids) != 0 {
		t.Errorf("other sees follows %v", ids)
	}

	if items := pageItems(t, w.other.c.Do("GET", "/api/favourites", nil)); len(items) != 0 {
		t.Errorf("other sees saved listings %v", items)
	}

	if items := pageItems(t, w.other.c.Do("GET", "/api/follows", nil)); len(items) != 0 {
		t.Errorf("other sees followed stores %v", items)
	}

	// Their delete reaches only their own (missing) row.
	tradeWant(t, "other unsave", w.other.c.Do("DELETE", "/api/favourites/"+w.listing, nil), 200)
	tradeWant(t, "other unfollow", w.other.c.Do("DELETE", "/api/follows/"+w.seller.id, nil), 200)

	if ids := favIDs(t, w.buyer, "favourites"); len(ids) != 1 {
		t.Errorf("buyer lost a saved listing: %v", ids)
	}

	if ids := favIDs(t, w.buyer, "follows"); len(ids) != 1 {
		t.Errorf("buyer lost a follow: %v", ids)
	}
}

func TestFavouriteNeedsAVisibleListing(t *testing.T) {
	w := newFavWorld(t)
	hidden := domainStock(t, w.seller.c, w.material, false)

	tradeWant(t, "unlisted", w.buyer.c.Do("PUT", "/api/favourites/"+hidden, nil), 404)
	tradeWant(t, "missing", w.buyer.c.Do("PUT", "/api/favourites/nope", nil), 404)

	// A listing from an unverified store is hidden too.
	tradeUnverify(t, w.app, w.seller)
	tradeWant(t, "unverified", w.buyer.c.Do("PUT", "/api/favourites/"+w.listing, nil), 404)
}

func TestSavedListingLeavesTheListWhenHidden(t *testing.T) {
	w := newFavWorld(t)
	tradeWant(t, "save", w.buyer.c.Do("PUT", "/api/favourites/"+w.listing, nil), 200)

	status(t, w.seller.c.Do("PATCH", "/api/stock/"+w.listing, map[string]any{"is_listed": false}), 200)

	if items := pageItems(t, w.buyer.c.Do("GET", "/api/favourites", nil)); len(items) != 0 {
		t.Fatalf("hidden listing still shown: %v", items)
	}
}

func TestFollowNeedsARealStore(t *testing.T) {
	w := newFavWorld(t)

	tradeWant(t, "missing", w.buyer.c.Do("PUT", "/api/follows/nope", nil), 404)
	tradeWant(t, "own store", w.seller.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 400)

	tradeUnverify(t, w.app, w.seller)
	tradeWant(t, "unverified", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 404)
}

func TestFollowCRUD(t *testing.T) {
	w := newFavWorld(t)

	tradeWant(t, "follow", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)
	tradeWant(t, "follow twice", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)

	if ids := favIDs(t, w.buyer, "follows"); len(ids) != 1 || ids[0] != w.seller.id {
		t.Fatalf("follow ids %v", ids)
	}

	list := w.buyer.c.Do("GET", "/api/follows", nil)
	tradeWant(t, "list", list, 200)

	if items := pageItems(t, list); len(items) != 1 || items[0]["id"] != w.seller.id {
		t.Fatalf("followed stores %s", list.Raw)
	}

	tradeWant(t, "unfollow", w.buyer.c.Do("DELETE", "/api/follows/"+w.seller.id, nil), 200)

	if ids := favIDs(t, w.buyer, "follows"); len(ids) != 0 {
		t.Fatalf("follow ids %v after unfollow", ids)
	}
}

func TestFollowersHearOncePerFirstPublish(t *testing.T) {
	w := newFavWorld(t)
	tradeWant(t, "follow", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)

	// Created already listed: one alert.
	created := status(t, w.seller.c.Do("POST", "/api/stock", map[string]any{
		"material_id": w.material, "weight": "5", "price": "2", "is_listed": true,
	}), 200).Body["id"].(string)

	if got := storeAlerts(t, w, w.buyer); got != "1" {
		t.Fatalf("alerts after create %s, want 1", got)
	}

	link := tradeText(t, w.app, `SELECT link FROM notifications WHERE user_id = $1
		AND type = 'store_new_listing'`, w.buyer.id)
	if link != "/market/listing/"+created {
		t.Errorf("alert link %q", link)
	}

	// Created unlisted, then listed: one more alert.
	draft := domainStock(t, w.seller.c, w.material, false)
	if got := storeAlerts(t, w, w.buyer); got != "1" {
		t.Fatalf("alerts after an unlisted create %s, want 1", got)
	}

	status(t, w.seller.c.Do("PATCH", "/api/stock/"+draft, map[string]any{"is_listed": true}), 200)

	if got := storeAlerts(t, w, w.buyer); got != "2" {
		t.Fatalf("alerts after first publish %s, want 2", got)
	}

	// Edit, unlist and list again: nothing new.
	status(t, w.seller.c.Do("PATCH", "/api/stock/"+draft, map[string]any{"price": "9"}), 200)
	status(t, w.seller.c.Do("PATCH", "/api/stock/"+draft, map[string]any{"is_listed": false}), 200)
	status(t, w.seller.c.Do("PATCH", "/api/stock/"+draft, map[string]any{"is_listed": true}), 200)

	if got := storeAlerts(t, w, w.buyer); got != "2" {
		t.Fatalf("alerts after edit and relist %s, want 2", got)
	}
}

func TestOnlyFollowersGetTheAlert(t *testing.T) {
	w := newFavWorld(t)
	tradeWant(t, "follow", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)

	domainStock(t, w.seller.c, w.material, true)

	if got := storeAlerts(t, w, w.buyer); got != "1" {
		t.Errorf("follower alerts %s, want 1", got)
	}

	for name, u := range map[string]tradeUser{"bystander": w.other, "seller": w.seller} {
		if got := storeAlerts(t, w, u); got != "0" {
			t.Errorf("%s alerts %s, want 0", name, got)
		}
	}

	// The alert is the follower's own row, not a team copy.
	if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications
		WHERE type = 'store_new_listing' AND business_id IS NOT NULL`); got != "0" {
		t.Errorf("%s alerts went to a business", got)
	}

	list := w.buyer.c.Do("GET", "/api/notifications", nil)
	if n := len(tradeItems(list)); n != 1 {
		t.Errorf("follower sees %d notifications: %s", n, list.Raw)
	}
}

func TestUnfollowKeepsOldAlertsAndStopsNewOnes(t *testing.T) {
	w := newFavWorld(t)
	tradeWant(t, "follow", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)
	domainStock(t, w.seller.c, w.material, true)

	tradeWant(t, "unfollow", w.buyer.c.Do("DELETE", "/api/follows/"+w.seller.id, nil), 200)
	domainStock(t, w.seller.c, w.material, true)

	if got := storeAlerts(t, w, w.buyer); got != "1" {
		t.Fatalf("alerts %s, want 1 (old kept, none new)", got)
	}

	if n := len(tradeItems(w.buyer.c.Do("GET", "/api/notifications", nil))); n != 1 {
		t.Errorf("bell shows %d, want 1", n)
	}
}

func TestNoAlertFromRawStockOrAFailedSave(t *testing.T) {
	w := newFavWorld(t)
	tradeWant(t, "follow", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)

	// A write that fails validation rolls back and tells nobody.
	bad := w.seller.c.Do("POST", "/api/stock", map[string]any{
		"material_id": w.material, "weight": "5", "price": "-1", "is_listed": true,
	})
	if bad.Status == 200 {
		t.Fatalf("bad price accepted: %s", bad.Raw)
	}

	// Stock written straight to SQL (as Give and the importer do) is silent.
	tradeStock(t, w.app, w.seller.id, w.material, "10", "3")

	if got := storeAlerts(t, w, w.buyer); got != "0" {
		t.Errorf("alerts %s, want 0", got)
	}
}

func TestFirstListedStampedOnlyWhenListed(t *testing.T) {
	w := newFavWorld(t)

	got := tradeText(t, w.app, `SELECT (first_listed_at IS NOT NULL)::text FROM stock WHERE id = $1`, w.listing)
	if got != "true" {
		t.Errorf("listed row has no first_listed_at")
	}

	draft := domainStock(t, w.seller.c, w.material, false)

	got = tradeText(t, w.app, `SELECT (first_listed_at IS NULL)::text FROM stock WHERE id = $1`, draft)
	if got != "true" {
		t.Errorf("unlisted row got first_listed_at")
	}
}

func TestLiveAlertReachesOnlyTheFollower(t *testing.T) {
	w := newFavWorld(t)
	tradeWant(t, "follow", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)

	socks := joinLive(t, w.app, w.buyer, w.other)
	follower, bystander := socks[0], socks[1]

	domainStock(t, w.seller.c, w.material, true)

	id := tradeText(t, w.app, `SELECT id FROM notifications WHERE user_id = $1
		AND type = 'store_new_listing'`, w.buyer.id)

	follower.hear("notification", id)

	// The public market event goes to everyone; the bell event must not.
	bystander.send(map[string]string{"type": "ping"})

	for ev := bystander.next(); ev["type"] != "pong"; ev = bystander.next() {
		if ev["kind"] == "notification" {
			t.Fatalf("bystander heard the follower's alert: %v", ev)
		}
	}
}
