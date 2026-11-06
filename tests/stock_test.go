package tests

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestStockOwnershipLeak(t *testing.T) {
	app := testutil.Server(t)
	owner, _ := domainUser(t, app, "business")
	other, _ := domainUser(t, app, "business")
	anonymous := app.NewClient(t)
	material := domainMaterial(t, app, "Copper", "2")
	id := domainStock(t, owner, material, false)

	for _, client := range []*testutil.Client{other, anonymous} {
		status(t, client.Do("GET", "/api/stock/"+id, nil), 404)
		want := 404
		if client == anonymous {
			want = 401
		}

		for _, patch := range []map[string]any{{"price": "0"}, {"weight": "99"}, {"is_listed": true}} {
			status(t, client.Do("PATCH", "/api/stock/"+id, patch), want)
		}

		status(t, client.Do("DELETE", "/api/stock/"+id, nil), want)
	}

	status(t, anonymous.Do("GET", "/api/stock", nil), 401)
	status(t, anonymous.Do("GET", "/api/stock?all=true", nil), 401)
	status(t, anonymous.Do("POST", "/api/stock", map[string]any{"material_id": material}), 401)

	for _, path := range []string{"/api/stock", "/api/stock?owner_id=forged"} {
		if items := pageItems(t, status(t, other.Do("GET", path, nil), 200)); len(items) != 0 {
			t.Fatalf("foreign stock visible: %+v", items)
		}
	}

	var items []any
	result := status(t, other.Do("GET", "/api/stock?all=true", nil), 200)
	if err := json.Unmarshal(result.Raw, &items); err != nil || len(items) != 0 {
		t.Fatalf("all: %s", result.Raw)
	}

	status(t, owner.Do("PATCH", "/api/stock/"+id, map[string]any{"is_listed": true}), 200)
	for _, client := range []*testutil.Client{other, anonymous} {
		noPrivateKeys(t, status(t, client.Do("GET", "/api/stock/"+id, nil), 200).Body)
	}

	status(t, owner.Do("DELETE", "/api/stock/"+id, nil), 200)
	status(t, owner.Do("GET", "/api/stock/"+id, nil), 404)
}

func TestStockCreateHonoursIsListed(t *testing.T) {
	app := testutil.Server(t)
	owner, _ := domainUser(t, app, "business")
	material := domainMaterial(t, app, "Copper", "2")

	for _, listed := range []bool{true, false} {
		created := status(
			t,
			owner.Do(
				"POST",
				"/api/stock",
				map[string]any{
					"material_id": material, "weight": "5", "price": "3", "is_listed": listed,
				},
			),
			200,
		)
		result := status(t, owner.Do("GET", "/api/stock/"+created.Body["id"].(string), nil), 200)
		if result.Body["is_listed"] != listed {
			t.Fatalf("is_listed %v was saved as %v", listed, result.Body["is_listed"])
		}
	}
}

func TestStockUpdateZeroPrice(t *testing.T) {
	app := testutil.Server(t)
	owner, ownerID := domainUser(t, app, "business")
	material := domainMaterial(t, app, "Copper", "2")
	id := domainStock(t, owner, material, false)

	for _, patch := range []map[string]any{{"price": "0"}, {"price": "1.999999999999999999"},
		{"weight": "0"}, {"weight": "-1"}, {"price": "NaN"}, {"price": 3}} {
		status(t, owner.Do("PATCH", "/api/stock/"+id, patch), 400)
	}

	for _, weight := range []string{"0", "-1"} {
		status(
			t,
			owner.Do(
				"POST",
				"/api/stock",
				map[string]any{
					"material_id": material, "weight": weight, "price": "3",
				},
			),
			400,
		)
	}
	status(
		t,
		owner.Do(
			"POST",
			"/api/stock",
			map[string]any{
				"material_id": material, "weight": "1", "price": "0",
			},
		),
		400,
	)

	status(t, owner.Do("PATCH", "/api/stock/"+id, map[string]any{"is_listed": true}), 200)
	status(t, owner.Do("PATCH", "/api/stock/"+id, map[string]any{"is_listed": true}), 200)
	result := status(t, owner.Do("GET", "/api/stock/"+id, nil), 200)
	if result.Body["price"] != "3.12" || result.Body["weight"] != "10.125" {
		t.Fatalf("omitted fields changed: %s", result.Raw)
	}

	status(t, owner.Do("PATCH", "/api/stock/"+id, map[string]any{"is_listed": false}), 200)
	var count int
	err := app.DB.Pool.QueryRow(
		context.Background(),
		`SELECT count(*) FROM notifications
		WHERE user_id=$1 AND NOT read AND NOT dismissed AND
		((type='stock_listed' AND title='Stock listed on market' AND body='Your Copper stock is now visible on the market.')
		OR (type='stock_unlisted' AND title='Stock removed from market' AND body='Your Copper stock is now hidden from the market.'))
		AND link='/stock'`,
		ownerID,
	).Scan(
		&count,
	)
	if err != nil || count != 2 {
		t.Fatalf("notifications: %d %v", count, err)
	}

	zeroBase := domainMaterial(t, app, "Glass", "0")
	zeroID := domainStock(t, owner, zeroBase, false)
	status(t, owner.Do("PATCH", "/api/stock/"+zeroID, map[string]any{"price": "0"}), 200)
	if result := status(t, owner.Do("GET", "/api/stock/"+zeroID, nil), 200); result.Body["price"] != "0" {
		t.Fatalf("explicit zero ignored: %s", result.Raw)
	}
}

func TestStockNotificationRollback(t *testing.T) {
	app := testutil.Server(t)
	owner, _ := domainUser(t, app, "business")
	id := domainStock(t, owner, domainMaterial(t, app, "Copper", "2"), false)
	_, err := app.DB.Pool.Exec(
		context.Background(),
		`ALTER TABLE notifications
		ADD CONSTRAINT force_notification_failure CHECK (type<>'stock_listed')`,
	)
	if err != nil {
		t.Fatal(err)
	}

	status(t, owner.Do("PATCH", "/api/stock/"+id, map[string]any{"is_listed": true}), 500)
	result := status(t, owner.Do("GET", "/api/stock/"+id, nil), 200)
	if result.Body["is_listed"] != false {
		t.Fatalf("stock committed without notification: %s", result.Raw)
	}
}

// A price under the base says the number, and stock prices stop at cents.
func TestStockPriceMessages(t *testing.T) {
	app := testutil.Server(t)
	owner, _ := domainUser(t, app, "business")
	material := domainMaterial(t, app, "Copper", "95")

	low := owner.Do("POST", "/api/stock",
		map[string]any{"material_id": material, "weight": "1", "price": "50"})
	status(t, low, 400)

	if fields, _ := low.Body["fields"].(map[string]any); fields["price"] != "Price must be at least R 95.00 / kg." {
		t.Errorf("low price message: %s", low.Raw)
	}

	status(t, owner.Do("POST", "/api/stock",
		map[string]any{"material_id": material, "weight": "1", "price": "95.125"}), 400)
	status(t, owner.Do("POST", "/api/stock",
		map[string]any{"material_id": material, "weight": "1", "price": "95.12"}), 200)
}
