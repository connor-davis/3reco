package tests

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/tests/testutil"
)

func TestQARound5AMaterialRules(t *testing.T) {
	app := testutil.Server(t)
	admin, _ := domainUser(t, app, "admin")
	body := map[string]any{"name": " Copper ", "gw_code": " GW13 ", "price": "100000.00", "carbon_factor": "2.25"}
	id := status(t, admin.Do("POST", "/api/admin/materials", body), 200).Body["id"].(string)
	got := status(t, admin.Do("GET", "/api/materials/"+id, nil), 200)
	if got.Body["name"] != "Copper" || got.Body["gw_code"] != "GW13" {
		t.Fatalf("untrimmed material: %s", got.Raw)
	}
	status(t, admin.Do("PATCH", "/api/admin/materials/"+id, body), 200)
	for _, field := range []string{"name", "gw_code"} {
		copy := map[string]any{"name": "Glass", "gw_code": "GW14", "price": "1.00", "carbon_factor": "1.5"}
		copy[field] = " " + strings.ToLower(body[field].(string)) + " "
		result := status(t, admin.Do("POST", "/api/admin/materials", copy), 409)
		if result.Body["fields"].(map[string]any)[field] == nil {
			t.Fatalf("duplicate error missing field %s: %s", field, result.Raw)
		}
	}
	other := status(t, admin.Do("POST", "/api/admin/materials", map[string]any{
		"name": "Glass", "gw_code": "GW14", "price": "0.01", "carbon_factor": "0.01",
	}), 200).Body["id"].(string)
	status(t, admin.Do("PATCH", "/api/admin/materials/"+other, map[string]any{"name": "COPPER"}), 409)
	status(t, admin.Do("PATCH", "/api/admin/materials/"+other, map[string]any{"gw_code": "gw13"}), 409)
	for _, value := range []string{"", "0", "-1", "1.001", "100000.01", "1e2", "NaN"} {
		status(t, admin.Do("PATCH", "/api/admin/materials/"+id, map[string]any{"price": value}), 400)
	}
	for _, value := range []string{"0", "-1", "1.001", "Infinity"} {
		status(t, admin.Do("PATCH", "/api/admin/materials/"+id, map[string]any{"carbon_factor": value}), 400)
	}
	for _, field := range []string{"name", "gw_code"} {
		result := status(t, admin.Do("PATCH", "/api/admin/materials/"+id, map[string]any{field: "  "}), 400)
		if result.Body["fields"].(map[string]any)[field] == nil {
			t.Fatalf("required field misplaced: %s", result.Raw)
		}
	}
	if price := tradeText(t, app, `SELECT price::text FROM materials WHERE id=$1`, id); price != "100000.00" {
		t.Fatalf("rejected input rewrote price: %s", price)
	}
}

func TestQARound5AMaterialRaceAndHistory(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	body := map[string]any{"name": "Race metal", "gw_code": "GW-RACE", "price": "2.25", "carbon_factor": "1.25"}
	results := make(chan int, 2)
	for range 2 {
		go func() {
			results <- admin.c.Do("POST", "/api/admin/materials", body).Status
		}()
	}
	first, second := <-results, <-results
	if !((first == 200 && second == 409) || (first == 409 && second == 200)) {
		t.Fatalf("concurrent duplicates: %d %d", first, second)
	}

	// Old fractional values must survive validation changes on the current catalog.
	id := database.NewID()
	tradeExec(t, w.app, `INSERT INTO transactions(id,seller_id,buyer_id,type,total_price,status)
		VALUES($1,$2,$3,'b2b',2.8956432,'complete')`, id, w.seller.id, w.buyer.id)
	tradeExec(t, w.app, `INSERT INTO transaction_items(transaction_id,position,material_id,weight,price)
		VALUES($1,0,$2,1.23456,2.34567)`, id, w.material)
	before := tradeText(t, w.app, `SELECT row_to_json(i)::text FROM transaction_items i WHERE transaction_id=$1`, id)
	status(t, admin.c.Do("PATCH", "/api/admin/materials/"+w.material, map[string]any{"price": "3.25"}), 200)
	if before != tradeText(t, w.app, `SELECT row_to_json(i)::text FROM transaction_items i WHERE transaction_id=$1`, id) ||
		tradeText(t, w.app, `SELECT total_price::text FROM transactions WHERE id=$1`, id) != "2.8956432" {
		t.Fatal("catalog validation rewrote historical money or weight")
	}
}

func TestQARound5AOffersRejectInvalidPricesWithoutEffects(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	path := "/api/requests/" + id + "/offer"
	for _, counter := range []bool{false, true} {
		actor := w.seller
		if counter {
			tradeOffer(t, w.seller, id, w.material, "1", "8")
			actor = w.buyer
		}
		before := tradeText(t, w.app, `SELECT row_to_json(r)::text FROM transaction_requests r WHERE id=$1`, id)
		holds := tradeText(t, w.app, `SELECT COALESCE(json_agg(h)::text,'[]') FROM stock_holds h WHERE request_id=$1`, id)
		for _, price := range []string{"", "0", "0.00", "-1", "1.001", "NaN"} {
			status(t, actor.c.Do("POST", path, map[string]any{
				"items": []map[string]any{tradeLine(w.material, "1", price)},
			}), 400)
		}
		after := tradeText(t, w.app, `SELECT row_to_json(r)::text FROM transaction_requests r WHERE id=$1`, id)
		if before != after || holds != tradeText(t, w.app,
			`SELECT COALESCE(json_agg(h)::text,'[]') FROM stock_holds h WHERE request_id=$1`, id) {
			t.Fatal("invalid offer changed the request or reservations")
		}
	}
}

func TestQARound5ACollectorTotal(t *testing.T) {
	app := testutil.Server(t)
	user, _ := domainUser(t, app, "business")
	for i := range 5 {
		body := collectorBody("")
		body["name"] = fmt.Sprintf("Total collector %d", i)
		body["email"] = fmt.Sprintf("total%d@example.test", i)
		status(t, user.Do("POST", "/api/collectors", body), 200)
	}
	first := status(t, user.Do("GET", "/api/collectors?limit=2&q=Total", nil), 200)
	if first.Body["total"] != float64(5) || len(pageItems(t, first)) != 2 {
		t.Fatalf("total is not the whole matching set: %s", first.Raw)
	}
	cursor := first.Body["next_cursor"].(string)
	second := status(t, user.Do("GET", "/api/collectors?limit=2&q=Total&cursor="+cursor, nil), 200)
	if second.Body["total"] != float64(5) {
		t.Fatalf("cursor reduced total: %s", second.Raw)
	}
	for _, test := range []struct {
		query string
		total float64
	}{{"Total%20collector%200", 1}, {"Missing", 0}} {
		got := status(t, user.Do("GET", "/api/collectors?q="+test.query, nil), 200)
		if got.Body["total"] != test.total {
			t.Fatalf("search total: %s", got.Raw)
		}
	}
}

func TestQARound5AInvoiceBranchMask(t *testing.T) {
	w := newTradeWorld(t)
	staff := tradeNewUser(t, w.app, "staff")
	admin := tradeNewUser(t, w.app, "admin")
	collectorUser := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, collectorUser.phone)
	for _, table := range []string{"businesses", "collectors"} {
		id := w.seller.id
		if table == "collectors" {
			id = collector
		}
		tradeExec(t, w.app, `UPDATE `+table+` SET bank_account_number=$2,bank_branch_code='250655' WHERE id=$1`,
			id, testutil.Seal(t, "123456789"))
	}
	b2b := tradeSale(t, w.seller, w.buyer, w.material, "1", "8")
	c2b := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "1", "2"))), 200).Body["transaction_id"].(string)
	tradeBackfillLast4(t, w.app)
	for _, id := range []string{b2b, c2b} {
		readers := []struct {
			user tradeUser
			role string
			full bool
		}{
			{staff, "staff", false}, {w.buyer, "business", true}, {admin, "admin", true},
		}
		if id == c2b {
			readers = append(readers, struct {
				user tradeUser
				role string
				full bool
			}{collectorUser, "collector", true})
		}
		for _, reader := range readers {
			user := auth.User{ID: reader.user.id, Role: &reader.role, ActiveBusinessID: reader.user.id, BusinessRole: "owner"}
			projected, _, err := w.app.Invoices.Document(context.Background(), user, id)
			if err != nil {
				t.Fatal(err)
			}
			account, branch := "•••• 6789", "•••• 0655"
			if reader.full {
				account, branch = "123456789", "250655"
			}
			if projected.Seller.Account != account || projected.Seller.Branch != branch {
				t.Fatalf("%s %s payout: %+v", id, reader.role, projected.Seller)
			}
		}
	}
}

func TestQARound5ASameDayNewestFirst(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800001001")
	ids := []string{}
	for i := range 3 {
		id := database.NewID()
		ids = append(ids, id)
		tradeExec(t, w.app, `INSERT INTO transactions
			(id,seller_id,buyer_id,type,total_price,status,collection_day,created_at)
			VALUES ($1,$2,$3,'c2b',1,'complete','2026-11-01',$4::timestamptz)`,
			id, collector, w.buyer.id, fmt.Sprintf("2026-11-02T12:00:%02dZ", i))
	}
	got := status(t, w.buyer.c.Do("GET", "/api/transactions/purchases?limit=2", nil), 200)
	rows := pageItems(t, got)
	if rows[0]["id"] != ids[2] || rows[1]["id"] != ids[1] {
		t.Fatalf("same-day order: %s", got.Raw)
	}
	got = status(t, w.buyer.c.Do("GET", "/api/transactions/purchases?limit=2&cursor="+got.Body["next_cursor"].(string), nil), 200)
	if pageItems(t, got)[0]["id"] != ids[0] {
		t.Fatalf("same-day cursor: %s", got.Raw)
	}
}
