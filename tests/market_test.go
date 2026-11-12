package tests

import (
	"context"
	"encoding/json"
	"fmt"
	"sync/atomic"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

var phoneSequence atomic.Uint64

func domainPhone() string {
	return fmt.Sprintf("081%07d", phoneSequence.Add(1))
}

// domainUnverified is a business 3REco has not verified yet.
func domainUnverified(t *testing.T, app *testutil.App) (*testutil.Client, string) {
	t.Helper()

	client, id := domainUser(t, app, "business")
	tradeExec(t, app, `UPDATE users SET business_verified_at = NULL WHERE id = $1`, id)

	return client, id
}

func domainUser(t *testing.T, app *testutil.App, role string) (*testutil.Client, string) {
	t.Helper()

	client := app.NewClient(t)
	email := signUp(t, app, client, true)
	var id string
	err := app.DB.Pool.QueryRow(
		context.Background(),
		`UPDATE users SET role=COALESCE(NULLIF($2,''),'guest'),
		phone=$3,id_number=$4,bank_account_number=$5,
		bank_account_holder_name='Private Holder',bank_name='Private Bank',bank_branch_code='123456',
		bank_account_type='Savings',
		business_name=CASE WHEN $2='business' THEN 'Business '||id ELSE NULL END,
		business_verified_at=CASE WHEN $2='business' THEN now() END
		WHERE email=$1 RETURNING id`,
		email,
		role,
		"+27"+domainPhone()[1:],
		testutil.Seal(t, "private-id"),
		testutil.Seal(t, "private-account"),
	).Scan(
		&id,
	)
	if err != nil {
		t.Fatal(err)
	}

	status(t, signIn(t, client, email, goodPassword), 200)

	return client, id
}

func status(t *testing.T, result testutil.Response, want int) testutil.Response {
	t.Helper()

	if result.Status != want {
		t.Fatalf("status %d, want %d: %s", result.Status, want, result.Raw)
	}

	return result
}

func domainMaterial(t *testing.T, app *testutil.App, name, price string) string {
	t.Helper()

	id := database.NewID()
	_, err := app.DB.Pool.Exec(
		context.Background(),
		`INSERT INTO materials(id,name,carbon_factor,gw_code,price)
		VALUES($1,$2,2,'GW1',$3::numeric)`,
		id,
		name,
		price,
	)
	if err != nil {
		t.Fatal(err)
	}

	return id
}

func domainStock(t *testing.T, client *testutil.Client, material string, listed bool) string {
	t.Helper()

	result := status(
		t,
		client.Do(
			"POST",
			"/api/stock",
			map[string]any{
				"material_id": material, "weight": "10.12", "price": "3.12",
			},
		),
		200,
	)
	id := result.Body["id"].(string)
	if listed {
		status(t, client.Do("PATCH", "/api/stock/"+id, map[string]any{"is_listed": true}), 200)
	}

	return id
}

func pageItems(t *testing.T, result testutil.Response) []map[string]any {
	t.Helper()

	var page struct {
		Items []map[string]any `json:"items"`
	}

	if err := json.Unmarshal(result.Raw, &page); err != nil {
		t.Fatal(err)
	}

	if page.Items == nil {
		t.Fatalf("items must be an array: %s", result.Raw)
	}

	return page.Items
}

func noPrivateKeys(t *testing.T, value any) {
	t.Helper()

	switch node := value.(type) {
	case map[string]any:
		for key, child := range node {
			switch key {
			case "email", "phone", "normalized_phone", "id_number", "bank_account_number",
				"bank_account_holder_name", "bank_name", "bank_branch_code", "bank_account_type",
				"ewallet_payment_id", "password_hash", "collector_snapshot":
				t.Errorf("private key %q in public response", key)
			}

			noPrivateKeys(t, child)
		}
	case []any:
		for _, child := range node {
			noPrivateKeys(t, child)
		}
	}
}

func TestSellerListingsOnlyListedPublic(t *testing.T) {
	app := testutil.Server(t)
	seller, sellerID := domainUser(t, app, "business")
	other, _ := domainUser(t, app, "business")
	anonymous := app.NewClient(t)
	material := domainMaterial(t, app, "Copper", "2")
	listed := domainStock(t, seller, material, true)
	hidden := domainStock(t, seller, material, false)

	for _, client := range []*testutil.Client{anonymous, other} {
		items := pageItems(t, status(t, client.Do("GET", "/api/stores/"+sellerID+"/listings", nil), 200))
		if len(items) != 1 || items[0]["id"] != listed {
			t.Fatalf("public listings: %+v", items)
		}

		result := status(t, client.Do("GET", "/api/market/listings/"+listed, nil), 200)
		noPrivateKeys(t, result.Body)
		if result.Body["price"] != "3.12" {
			t.Fatalf("price rounded: %s", result.Raw)
		}

		status(t, client.Do("GET", "/api/market/listings/"+hidden, nil), 404)
	}

	status(t, seller.Do("PATCH", "/api/stock/"+listed, map[string]any{"is_listed": false}), 200)
	status(t, anonymous.Do("GET", "/api/market/listings/"+listed, nil), 404)
}

func TestMarketFiltersAndPagination(t *testing.T) {
	app := testutil.Server(t)
	seller, sellerID := domainUser(t, app, "business")
	other, _ := domainUser(t, app, "business")
	anonymous := app.NewClient(t)
	material := domainMaterial(t, app, "Copper", "2")
	for range 3 {
		domainStock(t, seller, material, true)
	}
	_, err := app.DB.Pool.Exec(
		context.Background(),
		`UPDATE stock SET created_at='2026-01-01T00:00:00Z' WHERE owner_id=$1`,
		sellerID,
	)
	if err != nil {
		t.Fatal(err)
	}

	path := fmt.Sprintf(
		"/api/market/listings?seller_id=%s&material_id=%s&q=Copper&limit=1",
		sellerID,
		material,
	)
	seen := map[string]bool{}
	for range 3 {
		result := status(t, other.Do("GET", path, nil), 200)
		items := pageItems(t, result)
		if len(items) != 1 {
			t.Fatalf("page: %s", result.Raw)
		}

		id := items[0]["id"].(string)
		if seen[id] {
			t.Fatal("duplicate cursor item")
		}
		seen[id] = true

		if cursor, ok := result.Body["next_cursor"].(string); ok {
			path = fmt.Sprintf("/api/market/listings?seller_id=%s&limit=1&cursor=%s", sellerID, cursor)
		}
	}

	for _, client := range []*testutil.Client{anonymous, other} {
		items := pageItems(t, status(t, client.Do("GET", "/api/market/listings", nil), 200))
		if len(items) != 3 {
			t.Fatalf("public listing count %d", len(items))
		}
	}

	if items := pageItems(t, status(t, seller.Do("GET", "/api/market/listings", nil), 200)); len(items) != 0 {
		t.Fatalf("own listings visible: %+v", items)
	}
	status(t, anonymous.Do("GET", "/api/market/listings?cursor=bad", nil), 400)
	status(t, anonymous.Do("GET", "/api/market/listings?limit=201", nil), 200)

	_, err = app.DB.Pool.Exec(
		context.Background(),
		`UPDATE users SET is_removed=true WHERE id=$1`,
		sellerID,
	)
	if err != nil {
		t.Fatal(err)
	}

	if items := pageItems(t, status(t, anonymous.Do("GET", "/api/market/listings", nil), 200)); len(
		items,
	) != 0 {
		t.Fatal("removed seller visible")
	}
}
