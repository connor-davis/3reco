package tests

import (
	"io"
	"math/big"
	"net/url"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestExportsBusinessScope(t *testing.T) {
	w := newTradeWorld(t)
	staff := tradeNewUser(t, w.app, "staff")
	admin := tradeNewUser(t, w.app, "admin")
	other := tradeNewUser(t, w.app, "business")
	material := tradeMaterial(t, w.app, "Export paper", "3")
	tradeStock(t, w.app, w.seller.id, material, "20", "3")
	tradeStock(t, w.app, w.buyer.id, w.material, "30", "5")

	sale := status(t, w.seller.c.Do("POST", "/api/transactions/sales", map[string]any{
		"business_id": w.buyer.id,
		"items": []map[string]any{
			tradeLine(w.material, "2", "8"), tradeLine(material, "2", "3"),
		},
	}), 200).Body["transaction_id"].(string)
	bought := tradeSale(t, w.buyer, w.seller, w.material, "3", "5")
	tradeSale(t, w.buyer, other, w.material, "4", "5")
	collector := tradeCollector(t, w.app, w.seller, "+27800001411")
	collection := status(t, w.seller.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "1", "2"))), 200).
		Body["transaction_id"].(string)
	status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "5", "2"))), 200)

	query := "?business_id=" + url.QueryEscape(w.seller.id)
	for _, client := range []*testutil.Client{staff.c, admin.c} {
		for _, itemised := range []string{"false", "true"} {
			for _, kind := range []string{"transactions", "collections"} {
				path := "/api/exports/collections"
				want := map[string]int{collection: 1}
				if kind == "transactions" {
					path = "/api/admin/exports/transactions"
					want[sale], want[bought] = 1, 1
					if itemised == "true" {
						want[sale] = 2
					}
				}

				rows := csvRows(t, client, path+query+"&itemised="+itemised)
				got := map[string]int{}
				for _, row := range rows[1:] {
					got[row[0]]++
					if row[0] == sale && itemised == "false" &&
						(!strings.Contains(row[6], "Export paper") || !strings.Contains(row[6], "\n")) {
						t.Fatalf("combined materials missing: %v", row)
					}
				}
				if len(got) != len(want) {
					t.Fatalf("%s unexpected trades: %v, want %v", kind, got, want)
				}
				for id, count := range want {
					if got[id] != count {
						t.Fatalf("%s shape %s: %v, want %v", kind, itemised, got, want)
					}
				}

				response, err := client.HTTP.Get(w.app.URL + path + query)
				if err != nil {
					t.Fatal(err)
				}
				_, err = io.Copy(io.Discard, response.Body)
				response.Body.Close()
				if err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(response.Header.Get("Content-Disposition"), "-business-"+w.seller.id) {
					t.Fatalf("business missing from filename: %v", response.Header)
				}
			}
		}
	}

	filters := tradeText(t, w.app, `SELECT details->'filters'->>'business_id'
		FROM privacy_events WHERE kind='export' ORDER BY created_at DESC LIMIT 1`)
	if filters != w.seller.id {
		t.Fatalf("business audit filter = %q", filters)
	}
	for _, suffix := range []string{"", "&type=c2b"} {
		want := map[string]bool{sale: true, bought: true, collection: true}
		weight, value := "8", "39"
		if suffix != "" {
			want = map[string]bool{collection: true}
			weight, value = "1", "2"
		}

		for _, client := range []*testutil.Client{staff.c, admin.c} {
			path := "/api/transactions" + query + suffix + "&limit=1"
			seen := map[string]bool{}
			for {
				response := status(t, client.Do("GET", path, nil), 200)
				for _, row := range pageItems(t, response) {
					id := row["id"].(string)
					if !want[id] || seen[id] {
						t.Fatalf("unexpected or repeated business transaction: %v", row)
					}
					seen[id] = true
				}
				if response.Body["has_more"] != true {
					break
				}
				path = "/api/transactions" + query + suffix + "&limit=1&cursor=" +
					url.QueryEscape(response.Body["next_cursor"].(string))
			}
			if len(seen) != len(want) {
				t.Fatalf("business list: %v, want %v", seen, want)
			}

			totals := status(t, client.Do("GET", "/api/transactions/totals"+query+suffix, nil), 200)
			if totals.Body["count"] != float64(len(want)) {
				t.Fatalf("totals count: %s", totals.Raw)
			}
			for key, expected := range map[string]string{"weight": weight, "value": value} {
				actual, ok := new(big.Rat).SetString(totals.Body[key].(string))
				bound, _ := new(big.Rat).SetString(expected)
				if !ok || actual.Cmp(bound) != 0 {
					t.Fatalf("totals %s: %s", key, totals.Raw)
				}
			}
		}
	}

	for _, path := range []string{
		"/api/admin/exports/transactions", "/api/exports/collections", "/api/exports/purchases",
		"/api/exports/sales", "/api/transactions", "/api/transactions/totals",
	} {
		status(t, w.seller.c.Do("GET", path+query, nil), 403)
	}
	status(t, staff.c.Do("GET", "/api/admin/exports/users"+query, nil), 403)
	// A value looking like SQL remains a bound value and matches no business.
	injected := "?business_id=" + url.QueryEscape("' OR true --")
	if rows := csvRows(t, staff.c, "/api/admin/exports/transactions"+injected); len(rows) != 1 {
		t.Fatalf("business predicate was not bound: %v", rows)
	}
	status(t, staff.c.Do("GET", "/api/transactions/totals"+injected, nil), 200)
}

func TestExportsBusinessPickerDirectoryVisibility(t *testing.T) {
	w := newTradeWorld(t)
	staff := tradeNewUser(t, w.app, "staff")
	unverified := tradeNewUnverified(t, w.app)
	rows := pageItems(t, status(t, staff.c.Do("GET", "/api/stores?limit=50", nil), 200))
	found := false
	for _, row := range rows {
		if row["id"] == unverified.id {
			t.Fatal("directory visibility changed: unverified business is visible")
		}
		found = found || row["id"] == w.seller.id
	}
	if !found {
		t.Fatal("staff directory omitted verified business")
	}
}
