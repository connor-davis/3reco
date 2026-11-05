package tests

import (
	"context"
	"fmt"
	"net/http"
	"sync/atomic"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

// tradePhones hands out phone numbers that never repeat inside a test run.
var tradePhones atomic.Int64

// tradeUser is a signed-in person with a role.
type tradeUser struct {
	c     *testutil.Client
	id    string
	email string
	phone string
}

// tradeNewUser signs a person up, verifies them, gives them a role and a
// business name, and signs them in.
func tradeNewUser(t *testing.T, app *testutil.App, role string) tradeUser {
	t.Helper()

	c := app.NewClient(t)
	email := signUp(t, app, c, true)
	signIn(t, c, email, goodPassword)

	id := userID(t, c)
	phone := fmt.Sprintf("+27821%06d", tradePhones.Add(1))

	tradeExec(t, app, `
		UPDATE users SET role = $2, business_name = $3, phone = $4, normalized_phone = $4,
			profile_complete = true WHERE id = $1`, id, role, "Biz "+id[:6], phone)

	return tradeUser{c: c, id: id, email: email, phone: phone}
}

func tradeExec(t *testing.T, app *testutil.App, sql string, args ...any) {
	t.Helper()

	if _, err := app.DB.Pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}

// tradeText runs a query that returns one text value.
func tradeText(t *testing.T, app *testutil.App, sql string, args ...any) string {
	t.Helper()

	var out *string

	if err := app.DB.Pool.QueryRow(context.Background(), sql, args...).Scan(&out); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}

	if out == nil {
		return ""
	}

	return *out
}

func tradeMaterial(t *testing.T, app *testutil.App, name, price string) string {
	t.Helper()

	id := database.NewID()

	tradeExec(t, app, `
		INSERT INTO materials (id, name, carbon_factor, gw_code, price)
		VALUES ($1, $2, 2, 'GW', $3)`, id, name, price)

	return id
}

func tradeStock(t *testing.T, app *testutil.App, owner, material, weight, price string) string {
	t.Helper()

	id := database.NewID()

	tradeExec(t, app, `
		INSERT INTO stock (id, owner_id, material_id, weight, price, is_listed)
		VALUES ($1, $2, $3, $4, $5, true)`, id, owner, material, weight, price)

	return id
}

func tradeStockWeight(t *testing.T, app *testutil.App, owner, material string) string {
	t.Helper()

	return tradeText(t, app, `
		SELECT COALESCE(sum(weight), 0)::text FROM stock WHERE owner_id = $1 AND material_id = $2`,
		owner, material)
}

// tradeRequest opens a request from buyer to seller on one stock row.
func tradeRequest(t *testing.T, buyer, seller tradeUser, stockID string) string {
	t.Helper()

	res := buyer.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": seller.id,
		"items":     []map[string]any{{"stock_id": stockID}},
	})
	if res.Status != http.StatusOK {
		t.Fatalf("create request: %d %s", res.Status, res.Raw)
	}

	return res.Body["id"].(string)
}

func tradeLine(material, weight, price string) map[string]any {
	return map[string]any{"material_id": material, "weight": weight, "price": price}
}

// tradeOffer has the seller offer weight at price for one material.
func tradeOffer(t *testing.T, seller tradeUser, id, material, weight, price string) {
	t.Helper()

	res := seller.c.Do("POST", "/api/requests/"+id+"/offer", map[string]any{
		"items": []map[string]any{tradeLine(material, weight, price)},
	})
	if res.Status != http.StatusOK {
		t.Fatalf("offer: %d %s", res.Status, res.Raw)
	}
}

// tradeWant checks an HTTP status and shows the body when it is wrong.
func tradeWant(t *testing.T, what string, res testutil.Response, status int) {
	t.Helper()

	if res.Status != status {
		t.Errorf("%s: %d, want %d: %s", what, res.Status, status, res.Raw)
	}
}

// tradeSale makes a finished business sale from seller to buyer through the
// API and returns the transaction id.
func tradeSale(t *testing.T, seller, buyer tradeUser, material, weight, price string) string {
	t.Helper()

	res := seller.c.Do("POST", "/api/transactions/sales", map[string]any{
		"business_id": buyer.id,
		"items":       []map[string]any{tradeLine(material, weight, price)},
	})
	if res.Status != http.StatusOK {
		t.Fatalf("sale: %d %s", res.Status, res.Raw)
	}

	return res.Body["transaction_id"].(string)
}

func tradeItems(res testutil.Response) []any {
	items, _ := res.Body["items"].([]any)

	return items
}
