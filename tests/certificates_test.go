package tests

import (
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/pdf"
)

// certificateWorld is a trade world whose material has an exact carbon factor.
func certificateWorld(t *testing.T) tradeWorld {
	t.Helper()

	w := newTradeWorld(t)
	tradeExec(t, w.app, `UPDATE materials SET carbon_factor = 1.25 WHERE id = $1`, w.material)
	tradeStock(t, w.app, w.buyer.id, w.material, "100", "8")

	return w
}

func TestCertificateOneTrade(t *testing.T) {
	w := certificateWorld(t)
	// 1.05 kg at a factor of 1.255 is 1.31775 carbon, with every digit kept.
	tradeExec(t, w.app, `UPDATE materials SET carbon_factor = 1.255 WHERE id = $1`, w.material)
	id := tradeSale(t, w.seller, w.buyer, w.material, "1.05", "8")
	path := "/api/transactions/" + id + "/certificate"

	for _, client := range []tradeUser{w.seller, w.buyer} {
		got := status(t, client.c.Do("GET", path, nil), 200)
		for _, text := range []string{
			"RECYCLING RECORD", "records reported trade weights", "1.05", "1.31775",
			"Carbon saved = weight (kg) × the material's carbon factor in 3REco today.",
			"Glass", "ISSUED BY",
		} {
			if !pdfHas(t, got.Raw, text) {
				t.Errorf("record lacks %q", text)
			}
		}

		for _, claim := range []string{"certif", "audit", "legal"} {
			if strings.Contains(strings.ToLower(pdfText(t, got.Raw)), claim) {
				t.Errorf("record makes a %q claim", claim)
			}
		}
	}

	// The seller's weight reads as sold and the buyer's as bought.
	if text := pdfText(t, status(t, w.buyer.c.Do("GET", path, nil), 200).Raw); !strings.Contains(text, "Bought (kg)") {
		t.Error("record lacks its columns")
	}

	response, err := w.seller.c.HTTP.Get(w.app.URL + path)
	must(t, err)
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()

	number := strings.ToUpper(id[len(id)-8:])
	disposition := response.Header.Get("Content-Disposition")
	if response.Header.Get("Content-Type") != "application/pdf" ||
		response.Header.Get("Cache-Control") != "private, no-store" ||
		!strings.Contains(disposition, "3REco-Recycling-Record-"+number+".pdf") {
		t.Errorf("headers: %v", response.Header)
	}
}

func TestCertificateOneTradeAccess(t *testing.T) {
	w := certificateWorld(t)
	id := tradeSale(t, w.seller, w.buyer, w.material, "2", "8")
	path := "/api/transactions/" + id + "/certificate"

	member := tenantMember(t, w.app, w.seller.id, "member")
	manager := tenantMember(t, w.app, w.buyer.id, "manager")
	other := tradeNewUser(t, w.app, "business")
	otherMember := tenantMember(t, w.app, other.id, "owner")
	removed := tenantMember(t, w.app, w.seller.id, "manager")
	tradeExec(t, w.app, `DELETE FROM business_members WHERE user_id = $1`, removed.id)

	for _, person := range []tradeUser{member, manager} {
		status(t, person.c.Do("GET", path, nil), 200)
	}

	for _, person := range []tradeUser{other, otherMember, removed} {
		status(t, person.c.Do("GET", path, nil), 404)
	}

	status(t, w.app.NewClient(t).Do("GET", path, nil), 401)
	status(t, w.seller.c.Do("GET", "/api/transactions/missing/certificate", nil), 404)

	tradeExec(t, w.app, `UPDATE transactions SET status = 'pending' WHERE id = $1`, id)
	status(t, w.seller.c.Do("GET", path, nil), 404)
}

func TestCertificatePeriod(t *testing.T) {
	w := certificateWorld(t)
	other := tradeNewUser(t, w.app, "business")
	tradeStock(t, w.app, other.id, w.material, "100", "8")

	// Johannesburg is two hours ahead, so 21:59:59 UTC on 31 March is still March
	// and 22:00:00 UTC is already 1 April.
	march := tradeSale(t, w.seller, w.buyer, w.material, "1.5", "8")
	lastSecond := tradeSale(t, w.seller, w.buyer, w.material, "2.25", "8")
	april := tradeSale(t, w.seller, w.buyer, w.material, "4", "8")
	bought := tradeSale(t, w.buyer, w.seller, w.material, "0.5", "8")
	foreign := tradeSale(t, other, w.buyer, w.material, "7", "8")
	pending := tradeSale(t, w.seller, w.buyer, w.material, "9", "8")
	for id, at := range map[string]string{
		march:      "2026-03-01 00:00:00+02",
		lastSecond: "2026-03-31 21:59:59+00",
		april:      "2026-03-31 22:00:00+00",
		bought:     "2026-03-15 12:00:00+02",
		foreign:    "2026-03-10 12:00:00+02",
		pending:    "2026-03-12 12:00:00+02",
	} {
		tradeExec(t, w.app, `UPDATE transactions SET created_at = $2 WHERE id = $1`, id, at)
	}
	tradeExec(t, w.app, `UPDATE transactions SET status = 'pending' WHERE id = $1`, pending)

	path := "/api/certificates?from=2026-03-01&to=2026-03-31"
	got := status(t, w.seller.c.Do("GET", path, nil), 200)
	text := pdfText(t, got.Raw)

	// The seller sold 3.75 and bought 0.5, for 4.25 kg at 1.25: 5.3125 carbon.
	for _, want := range []string{
		"RECYCLING RECORD", "3.75", "0.50", "5.3125", "Total", "1 March 2026 to 31 March 2026",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("period record lacks %q:\n%s", want, text)
		}
	}

	// The buyer bought 1.5 + 2.25 from the seller and 7 from the other business, and
	// sold 0.5: 11.25 kg at 1.25 is 14.0625 carbon.
	buyer := pdfText(t, status(t, w.buyer.c.Do("GET", path, nil), 200).Raw)
	if !strings.Contains(buyer, "10.75") || !strings.Contains(buyer, "14.0625") {
		t.Errorf("buyer record:\n%s", buyer)
	}

	// The other business only ever sees its own sale.
	theirs := pdfText(t, status(t, other.c.Do("GET", path, nil), 200).Raw)
	if !strings.Contains(theirs, "7.00") || strings.Contains(theirs, "3.75") {
		t.Errorf("other business record:\n%s", theirs)
	}

	// April holds only the one trade that crossed midnight.
	april4 := pdfText(t, status(t, w.seller.c.Do("GET", "/api/certificates?from=2026-04-01&to=2026-04-01", nil), 200).Raw)
	if !strings.Contains(april4, "4.00") || strings.Contains(april4, "3.75") {
		t.Errorf("april record:\n%s", april4)
	}

	// A team member reads the business's period; a removed one has no trades of their own.
	member := tenantMember(t, w.app, w.seller.id, "member")
	status(t, member.c.Do("GET", path, nil), 200)
	tradeExec(t, w.app, `DELETE FROM business_members WHERE user_id = $1`, member.id)
	status(t, member.c.Do("GET", path, nil), 404)
}

func TestCertificatePeriodRefusals(t *testing.T) {
	w := certificateWorld(t)
	tradeSale(t, w.seller, w.buyer, w.material, "1", "8")

	for _, query := range []string{
		"", "?from=2026-03-01", "?to=2026-03-31", "?from=bad&to=2026-03-31",
		"?from=2026-02-30&to=2026-03-31", "?from=2026-03-31&to=2026-03-01",
		"?from=2025-01-01&to=2026-01-01", "?from=2026-01-01&to=2027-01-01",
	} {
		status(t, w.seller.c.Do("GET", "/api/certificates"+query, nil), 400)
	}

	// Exactly one year is fine; a range with no trades is a clear 404.
	status(t, w.seller.c.Do("GET", "/api/certificates?from=2020-01-01&to=2020-12-31", nil), 404)
	status(t, w.app.NewClient(t).Do("GET", "/api/certificates?from=2026-01-01&to=2026-01-02", nil), 401)

	staff := tradeNewUser(t, w.app, "staff")
	status(t, staff.c.Do("GET", "/api/certificates?from=2026-01-01&to=2026-01-02", nil), 403)
}

func TestCertificatePaginatesAndKeepsExactNumbers(t *testing.T) {
	record := pdf.Certificate{
		Subtitle: "2026-01-01 to 2026-12-31",
		Kind:     "Completed trades in a period",
		Details:  []pdf.Detail{{Label: "RECORD FOR", Text: "Exact Co"}},
		Headers:  []string{"Material", "Bought (kg)", "Sold (kg)", "Carbon saved (kg)"},
		Total:    []string{"Total", "1 234 567.89", "0.00", "9 999 999 999.123456"},
		Method:   "method line",
	}
	for index := range 120 {
		record.Rows = append(record.Rows, []string{
			fmt.Sprintf("Material number %d with a long wrapping name for the column", index),
			"1.005", "0.00", "1.25625",
		})
	}

	data, err := pdf.RenderCertificate(record)
	must(t, err)

	if pdfPages(t, data) < 2 {
		t.Error("120 materials fit on one page")
	}

	for _, want := range []string{
		"Material number 119", "9 999 999 999.123456", "1 234 567.89", "1.25625", "Page 2",
	} {
		if !pdfHas(t, data, want) {
			t.Errorf("long record lacks %q", want)
		}
	}
}
