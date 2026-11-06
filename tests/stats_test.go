package tests

import (
	"fmt"
	"math/big"
	"sort"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestPublicStats(t *testing.T) {
	app := testutil.Server(t)
	anon := app.NewClient(t)
	before := anon.Do("GET", "/api/stats", nil)
	tradeWant(t, "public stats", before, 200)
	if before.Body["total_kg"] != "0" || before.Body["co2_kg"] != "0" {
		t.Fatalf("empty totals: %s", before.Raw)
	}
	if before.Body["deals"] != float64(0) || len(before.Body["top_stores"].([]any)) != 0 {
		t.Fatalf("empty counts: %s", before.Raw)
	}

	seller := tradeNewUser(t, app, "business")
	buyer := tradeNewUser(t, app, "business")
	removed := tradeNewUser(t, app, "business")
	material := tradeMaterial(t, app, "Stats plastic", "1")
	tradeStock(t, app, seller.id, material, "100", "2")
	tradeStock(t, app, removed.id, material, "100", "2")
	tradeSale(t, seller, buyer, material, "12.125", "2")
	tradeSale(t, removed, buyer, material, "20", "2")
	tradeExec(t, app, `UPDATE users SET is_removed=true WHERE id=$1`, removed.id)

	collector := tradeCollector(t, app, buyer, "+27800000091")
	collection := buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(material, "3.5", "2")))
	tradeWant(t, "stats collection", collection, 200)

	after := anon.Do("GET", "/api/stats", nil)
	tradeWant(t, "public stats after trades", after, 200)
	if len(after.Body) != 4 {
		t.Fatalf("stats exposed unexpected keys: %s", after.Raw)
	}

	for key, expected := range map[string]string{"total_kg": "35.625", "co2_kg": "71.25"} {
		value, ok := after.Body[key].(string)
		if !ok {
			t.Fatalf("%s must be a decimal string: %s", key, after.Raw)
		}

		number, valid := new(big.Rat).SetString(value)
		want, _ := new(big.Rat).SetString(expected)
		if !valid || number.Cmp(want) != 0 {
			t.Errorf("%s=%s, want %s", key, value, expected)
		}
	}

	if after.Body["deals"] != float64(3) {
		t.Errorf("deal count: %s", after.Raw)
	}
	stores, ok := after.Body["top_stores"].([]any)
	if !ok || len(stores) != 2 {
		t.Fatalf("a b2b seller and a collection buyer, not the removed one: %s", after.Raw)
	}

	// The seller traded 12.125 kg; the buyer bought 3.5 kg of collections.
	for index, want := range []string{seller.id, buyer.id} {
		store := stores[index].(map[string]any)
		if len(store) != 3 || store["id"] != want {
			t.Fatalf("unexpected store %d projection: %s", index, after.Raw)
		}
		for _, key := range []string{"id", "name", "kg"} {
			if _, ok := store[key].(string); !ok {
				t.Errorf("store %s is not text: %s", key, after.Raw)
			}
		}
	}
}

func TestStatsTopFiveStores(t *testing.T) {
	app := testutil.Server(t)
	buyer := tradeNewUser(t, app, "business")
	material := tradeMaterial(t, app, "Stats ranking", "1")

	type rankedStore struct {
		id string
		kg int
	}
	want := []rankedStore{}
	for _, weight := range []int{5, 10, 10, 20, 30, 40} {
		seller := tradeNewUser(t, app, "business")
		tradeStock(t, app, seller.id, material, "100", "2")
		tradeSale(t, seller, buyer, material, fmt.Sprint(weight), "2")

		want = append(want, rankedStore{id: seller.id, kg: weight})
	}

	sort.Slice(want, func(first, second int) bool {
		if want[first].kg == want[second].kg {
			return want[first].id < want[second].id
		}

		return want[first].kg > want[second].kg
	})
	result := app.NewClient(t).Do("GET", "/api/stats", nil)
	tradeWant(t, "ranked stores", result, 200)
	stores := result.Body["top_stores"].([]any)
	if len(stores) != 5 {
		t.Fatalf("top store count=%d, want 5", len(stores))
	}

	for index, raw := range stores {
		store := raw.(map[string]any)
		if store["id"] != want[index].id {
			t.Errorf("store %d=%v, want %s", index, store, want[index].id)
		}

		weight, ok := new(big.Rat).SetString(store["kg"].(string))
		if !ok || weight.Cmp(big.NewRat(int64(want[index].kg), 1)) != 0 {
			t.Errorf("store %d weight=%v, want %d", index, store["kg"], want[index].kg)
		}
	}
}
