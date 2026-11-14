package tests

import (
	"net/url"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// One rule for money: every line is weight times price rounded half up to
// cents when it is written, and the trade total is the sum of those lines.
// Every screen, PDF and CSV then shows the same cents.
func TestMoneyRoundsOnceAndAgreesEverywhere(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000077")
	tradeExec(t, w.app, `UPDATE collectors SET created_by_business_id=$2 WHERE id=$1`, collector, w.buyer.id)

	one := tradeMaterial(t, w.app, "Tin", "0.01")
	two := tradeMaterial(t, w.app, "Zinc", "0.01")
	three := tradeMaterial(t, w.app, "Lead", "0.01")

	// 12.5 kg at R 0.01 is 0.125: it must be stored as 0.13, not 0.125.
	single := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(one, "12.5", "0.01")))
	tradeWant(t, "half-cent line", single, 200)

	id, _ := single.Body["transaction_id"].(string)
	if got := tradeText(t, w.app, `SELECT total_price::text FROM transactions WHERE id=$1`, id); got != "0.13" {
		t.Fatalf("stored total %q, want 0.13", got)
	}

	// Three lines of 0.005, 0.015 and 0.025: the rounded lines add to 0.06,
	// where the exact sum (0.045) would show as 0.05.
	multi := w.buyer.c.Do("POST", "/api/transactions/collections", tradeCollection(collector, "",
		tradeLine(one, "0.5", "0.01"), tradeLine(two, "0.5", "0.03"), tradeLine(three, "0.5", "0.05")))
	tradeWant(t, "three half-cent lines", multi, 200)

	second, _ := multi.Body["transaction_id"].(string)
	if got := tradeText(t, w.app, `SELECT total_price::text FROM transactions WHERE id=$1`, second); got != "0.06" {
		t.Fatalf("stored total %q, want 0.06", got)
	}

	// The invoice PDF shows the same cents on the line and the total.
	invoicePDF := w.buyer.c.Do("GET", "/api/transactions/"+id+"/invoice", nil)
	tradeWant(t, "invoice", invoicePDF, 200)

	if !pdfHas(t, invoicePDF.Raw, "0.13") || pdfHas(t, invoicePDF.Raw, "0.12") {
		t.Errorf("invoice does not show 0.13 alone")
	}

	// The CSV: each itemised line and the total column.
	lines := map[string]bool{}

	for _, row := range csvRows(t, w.buyer.c, "/api/exports/collections?itemised=true")[1:] {
		if row[0] == second {
			lines[row[10]] = row[12] == "0.06"
		}
	}

	for _, want := range []string{"0.01", "0.02", "0.03"} {
		if !lines[want] {
			t.Errorf("itemised CSV lines %v, want %s with total 0.06", lines, want)
		}
	}

	// Collector statistics and both dashboards add the stored totals: 0.13 + 0.06.
	stats := status(t, w.buyer.c.Do("GET", "/api/collectors/stats?phone="+url.QueryEscape("+27800000077"), nil), 200)
	if totals, _ := stats.Body["totals"].(map[string]any); totals["total_revenue"] != "0.19" {
		t.Errorf("collector revenue %v, want 0.19: %s", totals["total_revenue"], stats.Raw)
	}

	for name, res := range map[string]testutil.Response{
		"business": w.buyer.c.Do("GET", "/api/dashboard/business", nil),
		"admin":    admin.c.Do("GET", "/api/admin/dashboard", nil),
	} {
		if totals, _ := res.Body["totals"].(map[string]any); totals["value"] != "0.19" {
			t.Errorf("%s dashboard total %v, want 0.19: %s", name, totals["value"], res.Raw)
		}
	}
}

func TestPriceStopsAtCents(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000078")

	tradeWant(t, "three decimals", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "1", "0.125"))), 400)
	tradeWant(t, "two decimals", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "1", "0.12"))), 200)

	// A seller's offer follows the same rule.
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeWant(t, "offer with 3 decimals", w.seller.c.Do("POST", "/api/requests/"+id+"/offer",
		map[string]any{"items": []map[string]any{tradeLine(w.material, "10", "8.123")}}), 400)
}
