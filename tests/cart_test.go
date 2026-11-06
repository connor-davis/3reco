package tests

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestCartOwnershipAndValidation(t *testing.T) {
	app := testutil.Server(t)
	seller, sellerID := domainUser(t, app, "business")
	buyer, buyerID := domainUser(t, app, "business")
	other, _ := domainUser(t, app, "business")
	anonymous := app.NewClient(t)
	material := domainMaterial(t, app, "Copper", "2")
	stockID := domainStock(t, seller, material, true)
	hidden := domainStock(t, seller, material, false)
	path := "/api/cart?seller_id=" + sellerID
	body := map[string]any{"items": []map[string]any{{"stock_id": stockID, "material_id": material, "weight": "2.5"}}}

	for _, method := range []string{"GET", "PUT", "DELETE"} {
		status(t, anonymous.Do(method, path, body), 401)
	}
	status(t, buyer.Do("PUT", path, body), 200)
	result := status(t, buyer.Do("GET", path, nil), 200)
	noPrivateKeys(t, result.Body)
	var cart struct {
		Items []struct {
			StockID string `json:"stock_id"`
			Weight  string `json:"weight"`
			Price   string `json:"price"`
		}
	}

	if err := json.Unmarshal(result.Raw, &cart); err != nil {
		t.Fatal(err)
	}

	if len(cart.Items) != 1 || cart.Items[0].StockID != stockID || cart.Items[0].Weight != "2.5" ||
		cart.Items[0].Price != "3.1234567890123456789" {
		t.Fatalf("cart: %s", result.Raw)
	}

	result = status(t, other.Do("GET", path+"&buyer_id=forged", nil), 200)
	if len(result.Body["items"].([]any)) != 0 {
		t.Fatalf("foreign cart visible: %s", result.Raw)
	}
	status(t, other.Do("DELETE", path, nil), 200)
	status(t, other.Do("PUT", path+"&buyer_id="+buyerID, body), 200)
	result = status(t, buyer.Do("GET", path, nil), 200)
	if len(result.Body["items"].([]any)) != 1 {
		t.Fatal("foreign clear changed buyer cart")
	}
	status(t, other.Do("DELETE", path, nil), 200)

	for _, item := range []map[string]any{{"stock_id": hidden, "material_id": material, "weight": "2.5"},
		{"stock_id": stockID, "material_id": "wrong", "weight": "1"}} {
		status(t, buyer.Do("PUT", path, map[string]any{"items": []map[string]any{item}}), 404)
	}
	status(
		t,
		buyer.Do(
			"PUT",
			path,
			map[string]any{"items": []map[string]any{
				{"stock_id": stockID, "material_id": material, "weight": "2.5"}, {"stock_id": stockID, "material_id": material, "weight": "2.5"},
			}},
		),
		400,
	)
	status(t, buyer.Do("PUT", "/api/cart?seller_id=wrong", body), 404)
	status(t, seller.Do("PUT", path, body), 400)

	// A stale cart must lose its public display fields immediately on unlisting.
	status(t, seller.Do("PATCH", "/api/stock/"+stockID, map[string]any{"is_listed": false}), 200)
	result = status(t, buyer.Do("GET", path, nil), 200)
	if len(result.Body["items"].([]any)) != 0 {
		t.Fatal("cart exposes hidden stock")
	}

	status(t, buyer.Do("DELETE", path, nil), 200)
	var count int
	err := app.DB.Pool.QueryRow(context.Background(), `SELECT count(*) FROM carts`).Scan(&count)
	if err != nil || count != 0 {
		t.Fatalf("clear: %d %v", count, err)
	}
}
