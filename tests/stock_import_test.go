package tests

import (
	"fmt"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

const importHeader = "material,weight_kg,price_per_kg,listed,fulfillment,pickup_area\n"

func importRow(material, weight, price, listed string) map[string]any {
	return map[string]any{
		"material": material, "weight_kg": weight, "price_per_kg": price, "listed": listed,
		"fulfillment": "", "pickup_area": "",
	}
}

func importRows(rows ...map[string]any) map[string]any { return map[string]any{"rows": rows} }

func stockCount(t *testing.T, app *testutil.App, owner string) string {
	t.Helper()

	return tradeText(t, app, `SELECT count(*)::text FROM stock WHERE owner_id=$1`, owner)
}

func importErrors(t *testing.T, res testutil.Response, index int) map[string]any {
	t.Helper()

	rows, _ := res.Body["rows"].([]any)
	if index >= len(rows) {
		t.Fatalf("no row %d: %s", index, res.Raw)
	}

	errs, _ := rows[index].(map[string]any)["errors"].(map[string]any)

	return errs
}

func TestStockImportPreviewWritesNothing(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	glass := domainMaterial(t, app, "Glass", "2")

	csv := importHeader + "glass,10,5.50,yes,pickup,Durban\n" + "Nothing,1,1,,,\n"
	res := status(t, uploadImage(t, app, owner.c, "/api/stock/import/preview", []byte(csv)), 200)

	if res.Body["ok"] != false {
		t.Fatalf("a bad row must make ok false: %s", res.Raw)
	}

	if errs := importErrors(t, res, 0); len(errs) != 0 {
		t.Fatalf("good row has errors: %v", errs)
	}

	if errs := importErrors(t, res, 1); errs["material"] == nil {
		t.Fatalf("unknown material not marked: %v", errs)
	}

	first := res.Body["rows"].([]any)[0].(map[string]any)
	if first["material_name"] != "Glass" || first["price_per_kg"] != "5.50" {
		t.Fatalf("row not kept as typed: %v", first)
	}

	// Fixing a cell and checking again goes through the same route as JSON.
	again := importRows(importRow(glass, "10", "5.50", "yes"))
	status(t, owner.c.Do("POST", "/api/stock/import/preview", again), 200)

	if got := stockCount(t, app, owner.id); got != "0" {
		t.Fatalf("preview wrote %s rows", got)
	}
}

func TestStockImportOneBadRowRefusesAll(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	domainMaterial(t, app, "Glass", "2")

	res := owner.c.Do("POST", "/api/stock/import/commit", importRows(
		importRow("Glass", "10", "5", "yes"),
		importRow("Glass", "abc", "5", "yes"),
	))
	status(t, res, 400)

	details, _ := res.Body["details"].(map[string]any)
	if details == nil || details["ok"] != false {
		t.Fatalf("refusal must carry the marked rows: %s", res.Raw)
	}

	if got := stockCount(t, app, owner.id); got != "0" {
		t.Fatalf("a refused import left %s rows", got)
	}
}

func TestStockImportCommitInsertsExactlyTheRows(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	glass := domainMaterial(t, app, "Glass", "2")
	domainMaterial(t, app, "Copper", "3")

	rows := importRows(
		importRow("Glass", "19.99", "4.5", "yes"),
		importRow(glass, "1", "3", ""),
		map[string]any{
			"material": "copper", "weight_kg": "7", "price_per_kg": "9.99", "listed": "no",
			"fulfillment": "Both", "pickup_area": "Cape Town",
		},
	)
	res := status(t, owner.c.Do("POST", "/api/stock/import/commit", rows), 200)

	if res.Body["count"] != float64(3) {
		t.Fatalf("count: %s", res.Raw)
	}

	if got := stockCount(t, app, owner.id); got != "3" {
		t.Fatalf("inserted %s rows", got)
	}

	if got := tradeText(t, app, `SELECT weight::text||'/'||price::text||'/'||is_listed::text
		FROM stock WHERE owner_id=$1 AND weight=19.99`, owner.id); got != "19.99/4.5/true" {
		t.Fatalf("exact decimals lost: %s", got)
	}

	if got := tradeText(t, app, `SELECT fulfillment_mode||'/'||pickup_area FROM stock
		WHERE owner_id=$1 AND weight=7`, owner.id); got != "both/Cape Town" {
		t.Fatalf("options lost: %s", got)
	}

	if got := tradeText(t, app, `SELECT count(*)::text FROM stock
		WHERE owner_id=$1 AND is_listed AND first_listed_at IS NOT NULL`, owner.id); got != "1" {
		t.Fatalf("listed row must count as first published: %s", got)
	}
}

func TestStockImportLimitsAndDecimals(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	domainMaterial(t, app, "Glass", "2")

	cases := []struct{ weight, price, field string }{
		{"1000001", "5", "weight_kg"},
		{"1000000", "5", ""},
		{"10", "100001", "price_per_kg"},
		{"10", "100000", ""},
		{"19,99", "5", "weight_kg"},
		{"1e3", "5", "weight_kg"},
		{"10", "1e3", "price_per_kg"},
		{"10", "19,99", "price_per_kg"},
		{"10.123", "5", "weight_kg"},
		{"10", "5.123", "price_per_kg"},
		{"0", "5", "weight_kg"},
		{"", "5", "weight_kg"},
		{"19.99", "5", ""},
	}

	for _, test := range cases {
		res := status(t, owner.c.Do("POST", "/api/stock/import/preview",
			importRows(importRow("Glass", test.weight, test.price, ""))), 200)
		errs := importErrors(t, res, 0)

		if test.field == "" && len(errs) != 0 {
			t.Fatalf("%q/%q refused: %v", test.weight, test.price, errs)
		}

		if test.field != "" && errs[test.field] == nil {
			t.Fatalf("%q/%q not refused on %s: %v", test.weight, test.price, test.field, errs)
		}
	}
}

func TestStockImportFileAndRowLimits(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	domainMaterial(t, app, "Glass", "2")

	line := "Glass,1,1,,,\n"

	atLimit := importHeader + strings.Repeat(line, 500)
	status(t, uploadImage(t, app, owner.c, "/api/stock/import/preview", []byte(atLimit)), 200)

	tooMany := importHeader + strings.Repeat(line, 501)
	status(t, uploadImage(t, app, owner.c, "/api/stock/import/preview", []byte(tooMany)), 400)

	big := importHeader + "Glass,1,1,," + strings.Repeat("x", 1<<20) + ",\n"
	status(t, uploadImage(t, app, owner.c, "/api/stock/import/preview", []byte(big)), 400)

	rows := make([]map[string]any, 501)
	for i := range rows {
		rows[i] = importRow("Glass", "1", "1", "")
	}

	status(t, owner.c.Do("POST", "/api/stock/import/commit", importRows(rows...)), 400)
	status(t, owner.c.Do("POST", "/api/stock/import/commit", importRows()), 400)

	for _, bad := range []string{
		"", "material,weight_kg\nGlass,1\n", "material,weight_kg,price_per_kg,colour\nGlass,1,1,red\n",
		importHeader + "Glass,1,1,,,,extra\n",
	} {
		status(t, uploadImage(t, app, owner.c, "/api/stock/import/preview", []byte(bad)), 400)
	}

	if got := stockCount(t, app, owner.id); got != "0" {
		t.Fatalf("limits left %s rows", got)
	}
}

func TestStockImportRefusesFormulaCells(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	domainMaterial(t, app, "Glass", "2")

	for _, cell := range []string{"=1+1", "+5", "-5", "@SUM(A1)"} {
		row := importRow("Glass", "1", "1", "")
		row["pickup_area"] = cell
		row["fulfillment"] = cell

		res := status(t, owner.c.Do("POST", "/api/stock/import/preview", importRows(row)), 200)
		errs := importErrors(t, res, 0)

		if errs["pickup_area"] == nil || errs["fulfillment"] == nil {
			t.Fatalf("%q was not refused: %v", cell, errs)
		}

		status(t, owner.c.Do("POST", "/api/stock/import/commit", importRows(row)), 400)
	}

	res := status(t, owner.c.Do("POST", "/api/stock/import/preview",
		importRows(importRow("=cmd()", "=1+1", "+1", "@x"))), 200)
	for _, column := range []string{"material", "weight_kg", "price_per_kg", "listed"} {
		if importErrors(t, res, 0)[column] == nil {
			t.Fatalf("%s formula not refused: %s", column, res.Raw)
		}
	}

	if got := stockCount(t, app, owner.id); got != "0" {
		t.Fatalf("formula cells left %s rows", got)
	}
}

func TestStockImportMaterialsAndForeignIDs(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")
	glass := domainMaterial(t, app, "Glass", "2")
	foreign := domainStock(t, other.c, glass, true)

	domainMaterial(t, app, "Twin", "1")
	domainMaterial(t, app, "twin", "1")

	for name, want := range map[string]string{
		foreign: "no material", "Twin": "several", "": "add a material",
	} {
		res := status(t, owner.c.Do("POST", "/api/stock/import/preview",
			importRows(importRow(name, "1", "1", ""))), 200)

		message, _ := importErrors(t, res, 0)["material"].(string)
		if !strings.Contains(strings.ToLower(message), want) {
			t.Fatalf("material %q: %q, want %q", name, message, want)
		}

		status(t, owner.c.Do("POST", "/api/stock/import/commit",
			importRows(importRow(name, "1", "1", ""))), 400)
	}

	if stockCount(t, app, owner.id) != "0" || stockCount(t, app, other.id) != "1" {
		t.Fatal("a foreign stock id changed someone's stock")
	}
}

func TestStockImportStaysInTheCallersStore(t *testing.T) {
	app := testutil.Server(t)
	storeA := tradeNewUser(t, app, "business")
	userB := tradeNewUser(t, app, "business")
	domainMaterial(t, app, "Glass", "2")

	row := importRow("Glass", "5", "2", "yes")
	row["owner_id"] = storeA.id
	row["business_id"] = storeA.id
	body := importRows(row)
	body["owner_id"] = storeA.id

	status(t, userB.c.Do("POST", "/api/stock/import/commit", body), 200)

	if stockCount(t, app, storeA.id) != "0" || stockCount(t, app, userB.id) != "1" {
		t.Fatal("B's import landed in A's store")
	}
}

func TestStockImportNeedsManagerOrOwner(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	domainMaterial(t, app, "Glass", "2")

	member := tenantMember(t, app, owner.id, "member")
	manager := tenantMember(t, app, owner.id, "manager")
	guest, _ := domainUser(t, app, "guest")
	collector := tradeNewUser(t, app, "collector")
	body := importRows(importRow("Glass", "1", "1", ""))

	for _, path := range []string{"/api/stock/import/preview", "/api/stock/import/commit"} {
		status(t, app.NewClient(t).Do("POST", path, body), 401)

		for _, client := range []*testutil.Client{member.c, guest, collector.c} {
			status(t, client.Do("POST", path, body), 403)
		}
	}

	if stockCount(t, app, owner.id) != "0" {
		t.Fatal("a refused person imported stock")
	}

	status(t, manager.c.Do("POST", "/api/stock/import/commit", body), 200)
	status(t, owner.c.Do("POST", "/api/stock/import/commit", body), 200)

	if got := stockCount(t, app, owner.id); got != "2" {
		t.Fatalf("manager and owner imports gave %s rows", got)
	}
}

func TestStockImportAlertsEachPersonOnce(t *testing.T) {
	w := newFavWorld(t)
	bystander := tradeNewUser(t, w.app, "business")
	copper := domainMaterial(t, w.app, "Copper", "3")

	// buyer follows and also has a matching search; other only searches.
	status(t, w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)
	saveSearch(t, w.buyer, w.material, "", "")
	saveSearch(t, w.buyer, copper, "", "")
	saveSearch(t, w.other, w.material, "", "")
	saveSearch(t, w.other, copper, "", "")

	rows := importRows(
		importRow("Glass", "10", "5", "yes"),
		importRow("Glass", "11", "6", "yes"),
		importRow("Copper", "12", "7", "yes"),
		importRow("Copper", "13", "8", "no"),
	)
	status(t, w.seller.c.Do("POST", "/api/stock/import/commit", rows), 200)

	count := func(user tradeUser, kind string) string {
		return tradeText(t, w.app, `SELECT count(*)::text FROM notifications
			WHERE user_id=$1 AND type=$2`, user.id, kind)
	}

	if count(w.buyer, "store_new_listing") != "1" || count(w.buyer, "saved_search_match") != "0" {
		t.Fatal("a follower must get exactly one store alert and no search alert")
	}

	if count(w.other, "saved_search_match") != "1" || count(w.other, "store_new_listing") != "0" {
		t.Fatal("a searcher who does not follow must get exactly one search alert")
	}

	if count(bystander, "store_new_listing")+count(bystander, "saved_search_match") != "00" {
		t.Fatal("someone with no link to the store was alerted")
	}

	title := tradeText(t, w.app, `SELECT title||'|'||link FROM notifications
		WHERE user_id=$1 AND type='store_new_listing'`, w.buyer.id)
	if !strings.HasSuffix(title, "|/market/store/"+w.seller.id) ||
		!strings.Contains(title, " has 3 new listings|") {
		t.Fatalf("follower alert: %s", title)
	}

	link := tradeText(t, w.app, `SELECT link FROM notifications
		WHERE user_id=$1 AND type='saved_search_match'`, w.other.id)
	if link != "/market/store/"+w.seller.id {
		t.Fatalf("search alert link: %s", link)
	}
}

func TestStockImportUnlistedRowsAndRefusalsStayQuiet(t *testing.T) {
	w := newFavWorld(t)
	status(t, w.buyer.c.Do("PUT", "/api/follows/"+w.seller.id, nil), 200)
	saveSearch(t, w.other, w.material, "", "")

	quiet := func(label string) {
		t.Helper()

		got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications
			WHERE user_id IN ($1,$2) AND type IN ('store_new_listing','saved_search_match')`,
			w.buyer.id, w.other.id)
		if got != "0" {
			t.Fatalf("%s: %s alerts", label, got)
		}
	}

	status(t, w.seller.c.Do("POST", "/api/stock/import/commit",
		importRows(importRow("Glass", "10", "5", "no"))), 200)
	quiet("unlisted rows")

	status(t, w.seller.c.Do("POST", "/api/stock/import/commit", importRows(
		importRow("Glass", "10", "5", "yes"), importRow("Glass", "x", "5", "yes"))), 400)
	quiet("refused import")

	if got := fmt.Sprint(stockCount(t, w.app, w.seller.id)); got != "2" {
		t.Fatalf("seller has %s rows, want the fixture listing and one unlisted import", got)
	}
}
