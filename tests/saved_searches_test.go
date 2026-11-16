package tests

import (
	"context"
	"errors"
	"testing"

	stocksvc "github.com/connor-davis/3reco/internal/services/stock"
	stockstore "github.com/connor-davis/3reco/internal/stores/stock"
)

func saveSearch(t *testing.T, user tradeUser, material, minPrice, maxPrice string) string {
	t.Helper()
	res := status(t, user.c.Do("POST", "/api/saved-searches", map[string]any{
		"material_id": material, "min_price": minPrice, "max_price": maxPrice,
	}), 201)

	return res.Body["id"].(string)
}

func searchStock(t *testing.T, w favWorld, material, price string, listed bool) string {
	t.Helper()
	res := status(t, w.seller.c.Do("POST", "/api/stock", map[string]any{
		"material_id": material, "price": price, "weight": "10", "is_listed": listed,
	}), 200)

	return res.Body["id"].(string)
}

func searchAlerts(t *testing.T, w favWorld, user tradeUser) string {
	t.Helper()

	return tradeText(t, w.app, `SELECT count(*)::text FROM notifications
		WHERE user_id=$1 AND type='saved_search_match'`, user.id)
}

func TestSavedSearchCRUDAndPersonScope(t *testing.T) {
	w := newFavWorld(t)
	member := tenantMember(t, w.app, w.buyer.id, "member")
	id := saveSearch(t, w.buyer, w.material, "1.0001", "999999999.9999")

	items := pageItems(t, status(t, w.buyer.c.Do("GET", "/api/saved-searches", nil), 200))
	if len(items) != 1 || items[0]["id"] != id || items[0]["min_price"] != "1.0001" ||
		items[0]["max_price"] != "999999999.9999" || items[0]["material_name"] != "Glass" {
		t.Fatalf("saved search: %v", items)
	}

	for _, user := range []tradeUser{w.other, member} {
		// Supplying an owner in the URL cannot change the authenticated scope.
		res := status(t, user.c.Do("GET", "/api/saved-searches?user_id="+w.buyer.id, nil), 200)
		if len(pageItems(t, res)) != 0 {
			t.Fatalf("another person saw the buyer's search: %s", res.Raw)
		}

		status(t, user.c.Do("DELETE", "/api/saved-searches/"+id, nil), 200)
	}

	if len(pageItems(t, w.buyer.c.Do("GET", "/api/saved-searches", nil))) != 1 {
		t.Fatal("another person deleted the buyer's search")
	}

	status(t, w.buyer.c.Do("DELETE", "/api/saved-searches/"+id, nil), 200)
	status(t, w.buyer.c.Do("DELETE", "/api/saved-searches/"+id, nil), 200)
	if len(pageItems(t, w.buyer.c.Do("GET", "/api/saved-searches", nil))) != 0 {
		t.Fatal("search survived delete")
	}

	// A collector can save searches, as an individual too.
	collector := tradeNewUser(t, w.app, "collector")
	saveSearch(t, collector, w.material, "", "")
}

func TestSavedSearchRequiresSignIn(t *testing.T) {
	w := newFavWorld(t)
	anonymous := w.app.NewClient(t)
	status(t, anonymous.Do("GET", "/api/saved-searches", nil), 401)
	status(t, anonymous.Do("POST", "/api/saved-searches", map[string]any{}), 401)
	status(t, anonymous.Do("DELETE", "/api/saved-searches/nope", nil), 401)
}

func TestSavedSearchValidation(t *testing.T) {
	w := newFavWorld(t)
	for _, in := range []map[string]any{
		{},
		{"material_id": w.material, "min_price": "-1"},
		{"material_id": w.material, "max_price": "1e2"},
		{"material_id": w.material, "min_price": "1/2"},
		{"material_id": w.material, "max_price": "1.00001"},
		{"material_id": w.material, "min_price": "2.0001", "max_price": "2"},
		{"material_id": w.material, "min_price": 2.5},
	} {
		res := w.buyer.c.Do("POST", "/api/saved-searches", in)
		if res.Status < 400 || res.Status >= 500 {
			t.Errorf("invalid search %v: %d %s", in, res.Status, res.Raw)
		}
	}

	status(t, w.buyer.c.Do("POST", "/api/saved-searches", map[string]any{
		"material_id": "nope",
	}), 404)
	saveSearch(t, w.buyer, w.material, "0", "0")
}

func TestSavedSearchMatchesFirstPublishOnly(t *testing.T) {
	w := newFavWorld(t)
	saveSearch(t, w.buyer, w.material, "7", "9")
	searchStock(t, w, w.material, "8", true)
	if got := searchAlerts(t, w, w.buyer); got != "1" {
		t.Fatalf("create listed: %s alerts", got)
	}

	draft := searchStock(t, w, w.material, "8", false)
	if got := searchAlerts(t, w, w.buyer); got != "1" {
		t.Fatalf("unlisted create: %s alerts", got)
	}

	status(t, w.seller.c.Do("PATCH", "/api/stock/"+draft, map[string]any{"is_listed": true}), 200)
	if got := searchAlerts(t, w, w.buyer); got != "2" {
		t.Fatalf("publish draft: %s alerts", got)
	}

	for _, patch := range []map[string]any{
		{"price": "9"}, {"is_listed": false}, {"is_listed": true},
	} {
		status(t, w.seller.c.Do("PATCH", "/api/stock/"+draft, patch), 200)
		if got := searchAlerts(t, w, w.buyer); got != "2" {
			t.Fatalf("edit/unlist/relist %v: %s alerts", patch, got)
		}
	}
}

func TestSavedSearchMaterialAndInclusivePrices(t *testing.T) {
	w := newFavWorld(t)
	saveSearch(t, w.buyer, w.material, "7.0100", "9.9900")
	otherMaterial := domainMaterial(t, w.app, "Paper", "5")
	searchStock(t, w, otherMaterial, "8", true)
	searchStock(t, w, w.material, "7", true)
	outside := searchStock(t, w, w.material, "10", true)
	// Moving an existing listing into the range is an edit, not a new publication.
	status(t, w.seller.c.Do("PATCH", "/api/stock/"+outside, map[string]any{"price": "8"}), 200)
	if got := searchAlerts(t, w, w.buyer); got != "0" {
		t.Fatalf("nonmatches: %s alerts", got)
	}

	searchStock(t, w, w.material, "7.01", true)
	searchStock(t, w, w.material, "9.99", true)
	if got := searchAlerts(t, w, w.buyer); got != "2" {
		t.Fatalf("inclusive ends: %s alerts", got)
	}
}

func TestSavedSearchEmptyBoundsAndOverlaps(t *testing.T) {
	w := newFavWorld(t)
	saveSearch(t, w.buyer, w.material, "", "8")
	saveSearch(t, w.other, w.material, "8", "")
	searchStock(t, w, w.material, "7.99", true)
	searchStock(t, w, w.material, "8.01", true)
	if searchAlerts(t, w, w.buyer) != "1" || searchAlerts(t, w, w.other) != "1" {
		t.Fatal("one-sided price bounds did not match exactly")
	}

	saveSearch(t, w.buyer, w.material, "", "")
	saveSearch(t, w.buyer, w.material, "8", "8")
	searchStock(t, w, w.material, "8", true)
	if got := searchAlerts(t, w, w.buyer); got != "2" {
		t.Fatalf("overlapping searches should give one new alert: %s", got)
	}
}

func TestSavedSearchAndFollowGiveOneAlert(t *testing.T) {
	w := newFavWorld(t)
	saveSearch(t, w.buyer, w.material, "", "")
	status(t, w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)
	searchStock(t, w, w.material, "8", true)
	if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications
		WHERE user_id=$1 AND type IN ('store_new_listing','saved_search_match')`, w.buyer.id); got != "1" {
		t.Fatalf("follow + search gave %s alerts", got)
	}
}

func TestSavedSearchDeleteStopsNewAlertsAndKeepsOld(t *testing.T) {
	w := newFavWorld(t)
	id := saveSearch(t, w.buyer, w.material, "", "")
	searchStock(t, w, w.material, "8", true)
	status(t, w.buyer.c.Do("DELETE", "/api/saved-searches/"+id, nil), 200)
	searchStock(t, w, w.material, "8", true)
	if got := searchAlerts(t, w, w.buyer); got != "1" {
		t.Fatalf("delete must retain only the old alert: %s", got)
	}
}

func TestSavedSearchHiddenStoresStayQuiet(t *testing.T) {
	w := newFavWorld(t)
	saveSearch(t, w.buyer, w.material, "", "")
	tradeUnverify(t, w.app, w.seller)
	searchStock(t, w, w.material, "8", true)
	tradeExec(t, w.app, `UPDATE businesses SET business_verified_at=now(),is_removed=true WHERE id=$1`, w.seller.id)
	searchStock(t, w, w.material, "8", true)
	if got := searchAlerts(t, w, w.buyer); got != "0" {
		t.Fatalf("hidden seller gave %s alerts", got)
	}
}

func TestSavedSearchRolledBackPublishStaysQuiet(t *testing.T) {
	w := newFavWorld(t)
	saveSearch(t, w.buyer, w.material, "", "")
	service := stocksvc.New(w.app.DB, stockstore.New(w.app.DB), w.app.Storage)
	weight, price, listed := "10", "8", true
	rollback := errors.New("test rollback")
	var stockID string
	err := w.app.DB.InTx(context.Background(), func(ctx context.Context) error {
		var err error
		stockID, err = service.Create(ctx, w.seller.id, stocksvc.Input{
			MaterialID: w.material, Weight: &weight, Price: &price, IsListed: &listed,
		})
		if err != nil {
			return err
		}

		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatal(err)
	}

	if searchAlerts(t, w, w.buyer) != "0" {
		t.Fatal("rolled-back publish left an alert")
	}
	if tradeText(t, w.app, `SELECT count(*)::text FROM stock WHERE id=$1`, stockID) != "0" {
		t.Fatal("stock was not rolled back")
	}
}

func TestSavedSearchLiveReachesOnlyPerson(t *testing.T) {
	w := newFavWorld(t)
	member := tenantMember(t, w.app, w.buyer.id, "member")
	saveSearch(t, member, w.material, "", "")
	socks := joinLive(t, w.app, member, w.buyer, w.other)
	searchStock(t, w, w.material, "8", true)
	id := tradeText(t, w.app, `SELECT id FROM notifications
		WHERE user_id=$1 AND type='saved_search_match'`, member.id)
	socks[0].hear("notification", id)
	for _, sock := range socks[1:] {
		sock.send(map[string]string{"type": "ping"})
		for event := sock.next(); event["type"] != "pong"; event = sock.next() {
			if event["kind"] == "notification" {
				t.Fatalf("another person heard the search alert: %v", event)
			}
		}
	}

	if tradeText(t, w.app, `SELECT (business_id IS NULL)::text FROM notifications WHERE id=$1`, id) != "true" {
		t.Fatal("search alert expanded to a business")
	}
}

func TestSavedSearchLiveChangesArePersonal(t *testing.T) {
	w := newFavWorld(t)
	socks := joinLive(t, w.app, w.buyer, w.other)
	id := saveSearch(t, w.buyer, w.material, "", "")
	socks[0].hear("saved_search", id)
	status(t, w.buyer.c.Do("DELETE", "/api/saved-searches/"+id, nil), 200)
	socks[0].hear("saved_search", id)
	socks[1].send(map[string]string{"type": "ping"})
	for event := socks[1].next(); event["type"] != "pong"; event = socks[1].next() {
		if event["kind"] == "saved_search" {
			t.Fatalf("another person heard a saved search change: %v", event)
		}
	}
}
