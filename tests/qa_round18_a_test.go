package tests

import (
	"fmt"
	"github.com/connor-davis/3reco/tests/testutil"
	"math/big"
	"slices"
	"testing"
)

// sameMoney compares two exact decimals.
func sameMoney(t *testing.T, got any, want string) bool {
	t.Helper()

	text, _ := got.(string)
	have, ok := new(big.Rat).SetString(text)
	exact, _ := new(big.Rat).SetString(want)

	return ok && have.Cmp(exact) == 0
}

// QA round 18 A4: a partner counts what it bought and what it sold.
func TestRound18PartnersCountBothSides(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")

	tradeSale(t, w.seller, w.buyer, w.material, "20", "8") // 160.00, buyer purchases
	tradeSale(t, w.buyer, w.seller, w.material, "5", "9")  // 45.00, buyer sells

	collector := tradeCollector(t, w.app, w.buyer, "+27800000093")
	tradeWant(t, "collection", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "3.5", "2"))), 200) // 7.00

	rows := func(u tradeUser, path string) map[string]map[string]any {
		out := map[string]map[string]any{}

		cps, _ := tradeDash(t, u, path)["counterparties"].([]any)
		for _, c := range cps {
			row, _ := c.(map[string]any)
			out[row["id"].(string)] = row
		}

		return out
	}

	// The business sees its partner once, with both directions added up.
	mine := rows(w.buyer, "/api/dashboard/business")

	partner := mine[w.seller.id]
	if partner == nil || partner["count"] != float64(2) || !sameMoney(t, partner["value"], "205") {
		t.Errorf("business partner row %v, want 2 trades worth 205", partner)
	}

	if _, own := mine[w.buyer.id]; own {
		t.Errorf("the business lists itself")
	}

	// Admin credits both sides of every trade, collections included.
	all := rows(admin, "/api/admin/dashboard")
	want := map[string]struct {
		count int
		value string
	}{
		w.seller.id: {2, "205"},
		w.buyer.id:  {3, "212"},
		collector:   {1, "7"},
	}

	for id, w := range want {
		row := all[id]
		if row == nil || row["count"] != float64(w.count) || !sameMoney(t, row["value"], w.value) {
			t.Errorf("admin row for %s is %v, want %d trades worth %s", id, row, w.count, w.value)
		}
	}
}

// QA round 18 H1: the name sort runs on the server across cursor pages.
func TestRound18CollectorsSortDescendingAcrossPages(t *testing.T) {
	user, _ := domainUser(t, testutil.Server(t), "business")

	for i, name := range []string{"Zed", "amy", "Mo", "Bea", "bea", "Cy", "Al"} {
		body := collectorBody("")
		body["name"] = name
		body["email"] = fmt.Sprintf("d%d@example.test", i)
		status(t, user.Do("POST", "/api/collectors", body), 200)
	}

	walk := func(order string) []string {
		var ids []string

		cursor := ""
		for {
			url := "/api/collectors?limit=2&order=" + order
			if cursor != "" {
				url += "&cursor=" + cursor
			}

			result := status(t, user.Do("GET", url, nil), 200)
			for _, row := range pageItems(t, result) {
				ids = append(ids, row["id"].(string))
			}

			cursor, _ = result.Body["next_cursor"].(string)
			if cursor == "" {
				return ids
			}
		}
	}

	up, down := walk("asc"), walk("desc")
	if len(up) != 7 || len(down) != 7 {
		t.Fatalf("rows asc %d desc %d, want 7 each", len(up), len(down))
	}

	slices.Reverse(down)

	if !slices.Equal(up, down) {
		t.Fatalf("descending is not the exact reverse of ascending:\n%v\n%v", up, down)
	}
}

// One B2B trade is a row under both partners, but the admin totals the summary
// uses count it once.
func TestRound18AdminTotalsCountEachTradeOnce(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")

	tradeSale(t, w.seller, w.buyer, w.material, "20", "8") // 160.00

	body := tradeDash(t, admin, "/api/admin/dashboard")

	cps, _ := body["counterparties"].([]any)
	if len(cps) != 2 {
		t.Fatalf("partners %v, want the trade under both sides", cps)
	}

	for _, c := range cps {
		row, _ := c.(map[string]any)
		if row["count"] != float64(1) || !sameMoney(t, row["value"], "160") {
			t.Errorf("partner row %v, want 1 trade worth 160", row)
		}
	}

	totals, _ := body["totals"].(map[string]any)
	if totals["count"] != float64(1) || !sameMoney(t, totals["value"], "160") {
		t.Errorf("admin totals %v, want 1 trade worth 160", totals)
	}
}
