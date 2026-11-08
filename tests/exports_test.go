package tests

import (
	"encoding/csv"
	"net/url"
	"reflect"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

var exportHeader = []string{
	"Transaction ID", "Transaction Type", "Transaction Date", "Recorded At (SAST)", "Collection Day",
	"Items Count", "Materials", "Total Weight (kg)", "Total Price (R)", "Seller Name", "Seller Email",
	"Seller Phone", "Seller Address", "Buyer Name", "Buyer Email", "Buyer Phone", "Buyer Address",
	"Collector Payout Method", "Collector Payout Details",
	"Invoice number",
}

func csvRows(t *testing.T, client *testutil.Client, path string) [][]string {
	t.Helper()
	got := client.Do("GET", path, nil)
	if got.Status != 200 {
		t.Fatalf("CSV %s: %d %s", path, got.Status, got.Raw)
	}

	rows, err := csv.NewReader(strings.NewReader(string(got.Raw))).ReadAll()
	if err != nil {
		t.Fatal(err)
	}

	return rows
}

func TestExportsScopeAndColumns(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	collectorUser := tradeNewUser(t, w.app, "collector")
	stranger := tradeNewUser(t, w.app, "business")
	id := tradeSale(t, w.seller, w.buyer, w.material, "2.5", "8.13")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000008")
	collection := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "1.5", "3.5")))
	tradeWant(t, "export fixture", collection, 200)
	c2b := collection.Body["transaction_id"].(string)
	tradeExec(t, w.app, `UPDATE transactions SET created_at='2026-11-04T23:30:00Z' WHERE id=$1`, id)
	tradeExec(t, w.app, `UPDATE transactions SET created_at='2026-11-04T23:30:00Z' WHERE id=$1`, c2b)
	tradeExec(t, w.app, `UPDATE transactions SET collection_day='2026-10-01' WHERE id=$1`, c2b)
	tradeExec(t, w.app, `UPDATE users SET business_name='=SUM(1,2)',street_address=$2 WHERE id=$1`,
		w.seller.id, "Street, \"quoted\"\nsecond line")
	tradeExec(t, w.app, `UPDATE materials SET name=$2 WHERE id=$1`, w.material, "Copper, \"clean\"\nwire")

	for _, test := range []struct {
		client *testutil.Client
		path   string
		count  int
	}{
		{admin.c, "/api/admin/exports/transactions", 2},
		{staff.c, "/api/admin/exports/transactions", 2},
		{admin.c, "/api/exports/collections", 1},
		{staff.c, "/api/exports/collections", 1},
		{w.buyer.c, "/api/exports/collections", 1},
		{w.buyer.c, "/api/exports/purchases", 2},
		{w.seller.c, "/api/exports/sales", 1},
		{w.seller.c, "/api/exports/purchases", 0},
		{stranger.c, "/api/exports/purchases", 0},
		{stranger.c, "/api/exports/collections", 0},
		{stranger.c, "/api/exports/sales", 0},
	} {
		rows := csvRows(t, test.client, test.path)
		if !reflect.DeepEqual(rows[0], exportHeader) || len(rows) != test.count+1 {
			t.Errorf("%s: %v", test.path, rows)
		}
		for _, row := range rows[1:] {
			if row[3] != "2026-11-05 01:30:00" {
				t.Errorf("%s: timestamp is not readable SAST: %v", test.path, row)
			}
		}
	}

	row := csvRows(t, w.seller.c, "/api/exports/sales")[1]
	if row[0] != id || row[2] != "2026-11-05" || row[3] != "2026-11-05 01:30:00" ||
		row[7] != "2.50" || row[8] != "20.33" || row[9] != "'=SUM(1,2)" ||
		row[12] != "Street, \"quoted\"\nsecond line" ||
		row[6] != "1. Copper, \"clean\"\nwire - 2.50 kg x R 8.13 = R 20.33" {
		t.Fatalf("export values: %#v", row)
	}

	for _, path := range []string{"/api/admin/exports/transactions", "/api/admin/exports/users",
		"/api/exports/collections", "/api/exports/purchases", "/api/exports/sales"} {
		tradeWant(t, "collector denied", collectorUser.c.Do("GET", path, nil), 403)
		tradeWant(t, "anonymous denied", w.app.NewClient(t).Do("GET", path, nil), 401)
	}
	tradeWant(t, "business admin export", w.buyer.c.Do("GET", "/api/admin/exports/transactions", nil), 403)
	tradeWant(t, "staff users", staff.c.Do("GET", "/api/admin/exports/users", nil), 403)
	tradeWant(t, "admin personal purchases", admin.c.Do("GET", "/api/exports/purchases", nil), 403)

	bound := url.QueryEscape("2026-10-01T00:00:00+02:00")
	rows := csvRows(t, w.buyer.c, "/api/exports/collections?from="+bound+"&to="+bound)
	if len(rows) != 2 || rows[1][0] != c2b || rows[1][2] != "2026-10-01" {
		t.Fatalf("inclusive effective-date filter: %v", rows)
	}
	for _, query := range []string{"from=nope", "from=2026-10-01", "itemised=wrong",
		"from=2026-11-02T00:00:00Z&to=2026-11-01T00:00:00Z"} {
		tradeWant(t, "invalid filter", w.buyer.c.Do("GET", "/api/exports/purchases?"+query, nil), 400)
	}
}

func TestExportsItemisedAndUsers(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	material := tradeMaterial(t, w.app, "@danger", "1")
	tradeStock(t, w.app, w.seller.id, material, "20", "2")
	result := w.seller.c.Do("POST", "/api/transactions/sales", map[string]any{
		"business_id": w.buyer.id,
		"items":       []map[string]any{tradeLine(w.material, "1", "8"), tradeLine(material, "2", "3")},
	})
	tradeWant(t, "multiple lines", result, 200)
	tradeExec(t, w.app, `UPDATE transactions SET created_at='2026-11-04T23:30:00Z'
		WHERE id=$1`, result.Body["transaction_id"])
	rows := csvRows(t, w.seller.c, "/api/exports/sales?itemised=true")
	header := append(append([]string{}, exportHeader[:6]...),
		"Line No", "Material", "Line Weight (kg)", "Unit Price (R)", "Line Total (R)")
	header = append(header, exportHeader[7:]...)
	if len(rows) != 3 || !reflect.DeepEqual(rows[0], header) || rows[1][6] != "1" ||
		rows[2][6] != "2" || rows[2][11] != "3.00" {
		t.Fatalf("itemised CSV: %v", rows)
	}
	for _, row := range rows[1:] {
		if row[3] != "2026-11-05 01:30:00" {
			t.Fatalf("itemised timestamp is not readable SAST: %v", row)
		}
		if row[7] == "'@danger" && row[10] != "6.00" {
			t.Fatal("wrong exact line total")
		}
	}

	emptyID := database.NewID()
	tradeExec(t, w.app, `INSERT INTO transactions (id,seller_id,buyer_id,type,total_price,status)
		VALUES ($1,$2,$3,'b2b',0, 'complete')`, emptyID, w.seller.id, w.buyer.id)
	rows = csvRows(t, w.seller.c, "/api/exports/sales?itemised=true")
	found := false
	for _, row := range rows[1:] {
		if row[0] == emptyID {
			found = row[6] == "" && row[7] == "" && row[10] == "" && row[11] == "0.00"
		}
	}
	if !found {
		t.Fatal("empty transaction missing blank item row")
	}

	tradeExec(t, w.app, `UPDATE users SET bank_account_number=$2,id_number=$3,
		first_name='+formula',last_name='-formula' WHERE id=$1`, w.buyer.id,
		testutil.Seal(t, "never-export-bank"), testutil.Seal(t, "never-export-id"))
	tradeExec(t, w.app, `UPDATE users SET is_removed=true WHERE id=$1`, w.seller.id)
	tradeExec(t, w.app, `UPDATE users SET created_at='2026-11-04T23:30:00Z' WHERE id=$1`, w.buyer.id)
	rows = csvRows(t, admin.c, "/api/admin/exports/users")
	want := []string{"Email", "Account Type", "First Name", "Last Name", "Business Name", "Business Reg. No.",
		"Phone", "Street Address", "City", "Area Code", "Province", "Registered At (SAST)"}
	if !reflect.DeepEqual(rows[0], want) {
		t.Fatalf("user export columns: %v", rows[0])
	}
	for _, row := range rows[1:] {
		if row[0] == w.seller.email || strings.Contains(strings.Join(row, "|"), "never-export") {
			t.Fatal("user export leaked removed or private fields")
		}
		if row[0] == w.buyer.email && (row[2] != "'+formula" || row[3] != "'-formula") {
			t.Fatal("user formula guard missing")
		}
		if row[0] == w.buyer.email && row[11] != "2026-11-05 01:30:00" {
			t.Fatalf("registration timestamp is not readable SAST: %v", row)
		}
	}
}
