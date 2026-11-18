package tests

import (
	"net/url"
	"testing"
)

// savedWorld is a buyer with one of each saved kind, saved in a known order.
type savedWorld struct {
	favWorld
	second string
	search string
	// order is the expected "kind:id" list, newest save first.
	order []string
}

func newSavedWorld(t *testing.T) savedWorld {
	t.Helper()

	w := savedWorld{favWorld: newFavWorld(t)}
	w.second = domainStock(t, w.seller.c, w.material, true)

	tradeWant(t, "save first", w.buyer.c.Do("PUT", "/api/favourites/"+w.listing, nil), 200)
	w.search = saveSearch(t, w.buyer, w.material, "", "")
	tradeWant(t, "follow", w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)
	tradeWant(t, "save second", w.buyer.c.Do("PUT", "/api/favourites/"+w.second, nil), 200)

	w.order = []string{
		"listing:" + w.second,
		"store:" + w.seller.id,
		"search:" + w.search,
		"listing:" + w.listing,
	}

	return w
}

// savedKeys reads a page and returns its "kind:id" list, checking that the
// matching payload is present.
func savedKeys(t *testing.T, body map[string]any) []string {
	t.Helper()

	items, _ := body["items"].([]any)
	keys := []string{}

	for _, raw := range items {
		item := raw.(map[string]any)
		kind := item["kind"].(string)

		if item[kind] == nil {
			t.Fatalf("%s row has no %s payload: %v", kind, kind, item)
		}

		keys = append(keys, kind+":"+item["id"].(string))
	}

	return keys
}

func sameKeys(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}

	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}

	return true
}

func TestSavedMixedNewestFirstWithCounts(t *testing.T) {
	w := newSavedWorld(t)

	res := status(t, w.buyer.c.Do("GET", "/api/saved", nil), 200)
	if keys := savedKeys(t, res.Body); !sameKeys(keys, w.order) {
		t.Fatalf("order = %v, want %v", keys, w.order)
	}

	counts, _ := res.Body["counts"].(map[string]any)
	if counts["listing"] != float64(2) || counts["search"] != float64(1) || counts["store"] != float64(1) {
		t.Fatalf("counts = %v", counts)
	}

	// The listing carries the same summary the favourites list does.
	first := res.Body["items"].([]any)[0].(map[string]any)
	if first["listing"].(map[string]any)["material_name"] != "Glass" {
		t.Fatalf("listing summary: %v", first)
	}
}

func TestSavedPagesWithCursorAcrossKinds(t *testing.T) {
	w := newSavedWorld(t)

	got := []string{}
	cursor := ""

	for page := 0; page < 4; page++ {
		path := "/api/saved?limit=1"
		if cursor != "" {
			path += "&cursor=" + url.QueryEscape(cursor)
		}

		res := status(t, w.buyer.c.Do("GET", path, nil), 200)
		keys := savedKeys(t, res.Body)

		if len(keys) != 1 {
			t.Fatalf("page %d has %d rows", page, len(keys))
		}

		got = append(got, keys...)

		more, _ := res.Body["has_more"].(bool)
		if more != (page < 3) {
			t.Fatalf("page %d has_more = %v", page, more)
		}

		cursor, _ = res.Body["next_cursor"].(string)
	}

	if !sameKeys(got, w.order) {
		t.Fatalf("paged order = %v, want %v", got, w.order)
	}
}

func TestSavedTypeFilterAndBadInput(t *testing.T) {
	w := newSavedWorld(t)

	cases := map[string][]string{
		"listing": {"listing:" + w.second, "listing:" + w.listing},
		"search":  {"search:" + w.search},
		"store":   {"store:" + w.seller.id},
	}

	for kind, want := range cases {
		res := status(t, w.buyer.c.Do("GET", "/api/saved?type="+kind, nil), 200)
		if keys := savedKeys(t, res.Body); !sameKeys(keys, want) {
			t.Errorf("type=%s gave %v, want %v", kind, keys, want)
		}

		// The totals stay whole so the chips never change with the filter.
		counts := res.Body["counts"].(map[string]any)
		if counts["listing"] != float64(2) || counts["store"] != float64(1) {
			t.Errorf("type=%s counts = %v", kind, counts)
		}
	}

	status(t, w.buyer.c.Do("GET", "/api/saved?type=nope", nil), 400)
	status(t, w.buyer.c.Do("GET", "/api/saved?cursor=not-a-cursor", nil), 400)
}

func TestSavedHidesWhatIsNoLongerVisible(t *testing.T) {
	w := newSavedWorld(t)

	tradeExec(t, w.app, `UPDATE stock SET is_listed = false WHERE id = $1`, w.second)

	res := status(t, w.buyer.c.Do("GET", "/api/saved", nil), 200)
	if len(savedKeys(t, res.Body)) != 3 {
		t.Fatalf("an unlisted listing still shows: %s", res.Raw)
	}

	if res.Body["counts"].(map[string]any)["listing"] != float64(1) {
		t.Fatalf("counts still include the unlisted listing: %s", res.Raw)
	}

	tradeUnverify(t, w.app, w.seller)

	res = status(t, w.buyer.c.Do("GET", "/api/saved?type=store", nil), 200)
	if len(savedKeys(t, res.Body)) != 0 {
		t.Fatalf("an unverified store still shows: %s", res.Raw)
	}
}

func TestSavedNeedsSignIn(t *testing.T) {
	w := newSavedWorld(t)

	anon := w.app.NewClient(t)
	tradeWant(t, "signed out", anon.Do("GET", "/api/saved", nil), 401)
}

func TestSavedNeverShowsAnotherPersonsRows(t *testing.T) {
	w := newSavedWorld(t)

	// The bystander saves one thing of their own.
	tradeWant(t, "other save", w.other.c.Do("PUT", "/api/favourites/"+w.listing, nil), 200)

	for _, path := range []string{
		"/api/saved",
		"/api/saved?user_id=" + w.buyer.id,
		"/api/saved?type=search&user_id=" + w.buyer.id,
		"/api/saved?type=store",
	} {
		res := status(t, w.other.c.Do("GET", path, nil), 200)

		for _, key := range savedKeys(t, res.Body) {
			if key != "listing:"+w.listing {
				t.Fatalf("%s leaked the buyer's row %s", path, key)
			}
		}

		// Their totals are their own: one listing, no searches, no follows.
		counts := res.Body["counts"].(map[string]any)
		if counts["listing"] != float64(1) || counts["search"] != float64(0) || counts["store"] != float64(0) {
			t.Fatalf("%s leaked the buyer's counts: %v", path, counts)
		}
	}

	// The buyer's own list is unchanged by the bystander's save.
	res := status(t, w.buyer.c.Do("GET", "/api/saved", nil), 200)
	if keys := savedKeys(t, res.Body); !sameKeys(keys, w.order) {
		t.Fatalf("buyer order changed: %v", keys)
	}
}
