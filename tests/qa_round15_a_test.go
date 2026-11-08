package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestRound15StockManualCaps(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")
	path := "/api/stock/" + w.stock

	for _, test := range []struct{ field, value, message string }{
		{"weight", "99999999999", "Weight must be 1 000 000 kg or less."},
		{"weight", "1000000.01", "Weight must be 1 000 000 kg or less."},
		{"price", "100000.01", "Price must be R 100 000.00 per kg or less."},
	} {
		t.Run(test.field+test.value, func(t *testing.T) {
			body := map[string]any{"material_id": w.material, "weight": "1", "price": "8"}
			body[test.field] = test.value
			created := status(t, w.seller.c.Do("POST", "/api/stock", body), 400)
			updated := status(t, w.seller.c.Do("PATCH", path,
				map[string]any{test.field: test.value}), 400)

			for _, result := range []testutil.Response{created, updated} {
				fields, _ := result.Body["fields"].(map[string]any)
				if fields[test.field] != test.message {
					t.Fatalf("cap message: %s", result.Raw)
				}
			}

			status(t, stranger.c.Do("PATCH", path, map[string]any{test.field: test.value}), 404)
		})
	}

	if weight := tradeStockWeight(t, w.app, w.seller.id, w.material); weight != "100" {
		t.Fatalf("refused stock writes changed weight: %s", weight)
	}

	status(t, w.seller.c.Do("PATCH", path,
		map[string]any{"weight": "1000000", "price": "100000.00"}), 200)
	otherMaterial := tradeMaterial(t, w.app, "Boundary material", "1")
	status(t, w.seller.c.Do("POST", "/api/stock", map[string]any{
		"material_id": otherMaterial, "weight": "1000000.00", "price": "100000.00",
	}), 200)
}

func TestRound15LegacyStockRemainsEditable(t *testing.T) {
	w := newTradeWorld(t)
	path := "/api/stock/" + w.stock

	// Store.Give uses direct SQL, bypassing stock.validate, so collections and
	// trades can accumulate past the manual cap. Model that accumulated row here.
	tradeExec(t, w.app, `UPDATE stock SET weight=1000001, price=100001 WHERE id=$1`, w.stock)
	for _, patch := range []map[string]any{
		{"is_listed": false},
		{"weight": "1000001.00", "price": "100001.00", "is_listed": true},
		{"price": "9"},
	} {
		status(t, w.seller.c.Do("PATCH", path, patch), 200)
	}

	result := status(t, w.seller.c.Do("GET", path, nil), 200)
	if result.Body["weight"] != "1000001.00" || result.Body["price"] != "9" {
		t.Fatalf("legacy edit changed the wrong amounts: %s", result.Raw)
	}

	tradeExec(t, w.app, `UPDATE stock SET price=100001 WHERE id=$1`, w.stock)
	status(t, w.seller.c.Do("PATCH", path, map[string]any{"weight": "2"}), 200)
	status(t, w.seller.c.Do("PATCH", path, map[string]any{"weight": "1000002"}), 400)
	status(t, w.seller.c.Do("PATCH", path, map[string]any{"price": "100002"}), 400)
}

func TestRound15GroupedPriceCapMessages(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	admin := tradeNewUser(t, w.app, "admin")

	offer := status(t, w.seller.c.Do("POST", "/api/requests/"+id+"/offer", map[string]any{
		"items": []map[string]any{tradeLine(w.material, "1", "100000.01")},
	}), 400)
	material := status(t, admin.c.Do("PATCH", "/api/admin/materials/"+w.material,
		map[string]any{"price": "100000.01"}), 400)
	for _, result := range []testutil.Response{offer, material} {
		fields, _ := result.Body["fields"].(map[string]any)
		if fields["price"] != "Price must be R 100 000.00 per kg or less." {
			t.Fatalf("cap message: %s", result.Raw)
		}
	}

	status(t, w.buyer.c.Do("PATCH", "/api/admin/materials/"+w.material,
		map[string]any{"price": "100000.01"}), 403)
}

func TestRound15ReviewMaterialsBelongToItsTrade(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")
	second := tradeMaterial(t, w.app, "Aluminium", "1")
	tradeStock(t, w.app, w.seller.id, second, "10", "8")
	tx := tradeSale(t, w.seller, w.buyer, w.material, "1", "8")
	tradeExec(t, w.app, `INSERT INTO transaction_items
		(transaction_id,material_id,weight,price,position) VALUES ($1,$2,1,8,1)`, tx, second)
	other := tradeMaterial(t, w.app, "Unrelated glass", "1")
	tradeStock(t, w.app, w.seller.id, other, "10", "8")
	tradeSale(t, w.seller, w.buyer, other, "1", "8")

	status(t, w.buyer.c.Do("POST", "/api/transactions/"+tx+"/review",
		map[string]any{"rating": 5}), 200)
	name := tradeText(t, w.app, `SELECT name FROM materials WHERE id=$1`, w.material)
	for _, client := range []*testutil.Client{w.app.NewClient(t), w.buyer.c, stranger.c} {
		result := status(t, client.Do("GET", "/api/stores/"+w.seller.id+"/reviews", nil), 200)
		items := tradeItems(result)
		if len(items) != 1 {
			t.Fatalf("reviews: %s", result.Raw)
		}

		row := items[0].(map[string]any)
		if row["materials"] != "Aluminium; "+name {
			t.Fatalf("review includes wrong trade materials: %s", result.Raw)
		}
	}
}

func TestRound15StaffMayRemoveUnrelatedCollector(t *testing.T) {
	w := newTradeWorld(t)
	staff := tradeNewUser(t, w.app, "staff")
	collector := tradeCollector(t, w.app, w.seller, "+27800000095")
	path := "/api/collectors/" + collector
	email := tradeText(t, w.app, `SELECT email FROM collectors WHERE id=$1`, collector)
	confirmation := email
	if confirmation == "" {
		confirmation = "+27800000095"
	}
	body := map[string]any{"confirmation_value": confirmation}

	status(t, w.buyer.c.Do("DELETE", path, body), 403)
	status(t, w.seller.c.Do("GET", path, nil), 200)
	status(t, staff.c.Do("DELETE", path, body), 200)
	status(t, staff.c.Do("GET", path, nil), 404)
}
