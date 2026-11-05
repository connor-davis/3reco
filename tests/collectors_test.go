package tests

import (
	"context"
	"net/url"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

func collectorBody(phone string) map[string]any {
	return map[string]any{"name": "Collector A", "phone": phone, "email": "collector@example.test",
		"payout_method": "bank", "bank_account_holder_name": "Holder", "bank_name": "Bank",
		"bank_account_number": "123456789", "bank_branch_code": "123456", "bank_account_type": "Savings",
		"street_address": "Private Street", "city": "Cape Town", "province": "Western Cape", "area_code": 8000}
}

func TestCollectorDetailsRedactPayout(t *testing.T) {
	app := testutil.Server(t)
	creator, _ := domainUser(t, app, "business")
	other, _ := domainUser(t, app, "business")
	member, _ := domainUser(t, app, "")
	admin, _ := domainUser(t, app, "admin")
	anonymous := app.NewClient(t)
	phone := domainPhone()
	id := status(t, creator.Do("POST", "/api/collectors", collectorBody(phone)), 200).Body["id"].(string)

	status(t, anonymous.Do("GET", "/api/collectors/"+id, nil), 401)
	for _, client := range []*testutil.Client{member, other} {
		result := status(t, client.Do("GET", "/api/collectors/"+id, nil), 200)
		noPrivateKeys(t, result.Body)
		if _, ok := result.Body["street_address"]; ok {
			t.Fatal("private address visible")
		}
	}

	for _, client := range []*testutil.Client{creator, admin} {
		result := status(t, client.Do("GET", "/api/collectors/"+id, nil), 200)
		if result.Body["bank_account_number"] != "123456789" {
			t.Fatalf("privileged record: %s", result.Raw)
		}
	}

	result := status(t, other.Do("GET", "/api/collectors", nil), 200)
	noPrivateKeys(t, result.Body)
	if len(pageItems(t, result)) != 1 {
		t.Fatalf("legacy directory: %s", result.Raw)
	}
	status(t, creator.Do("GET", "/api/collectors/selection", nil), 200)
	status(t, other.Do("GET", "/api/collectors/selection", nil), 200)

	for _, client := range []*testutil.Client{member, anonymous} {
		want := 403
		if client == anonymous {
			want = 401
		}

		for _, path := range []string{"/api/collectors", "/api/collectors/selection"} {
			status(t, client.Do("GET", path, nil), want)
		}
		status(t, client.Do("POST", "/api/collectors", collectorBody("0831234567")), want)
		status(t, client.Do("PATCH", "/api/collectors/"+id, map[string]any{"name": "Forged"}), want)
		status(
			t,
			client.Do(
				"DELETE",
				"/api/collectors/"+id,
				map[string]any{"confirmation_value": "collector@example.test"},
			),
			want,
		)
	}

	status(t, other.Do("PATCH", "/api/collectors/"+id, map[string]any{"name": "Forged"}), 404)
	status(
		t,
		other.Do(
			"DELETE",
			"/api/collectors/"+id,
			map[string]any{"confirmation_value": "collector@example.test"},
		),
		403,
	)
	status(
		t,
		creator.Do(
			"DELETE",
			"/api/collectors/"+id,
			map[string]any{"confirmation_value": "collector@example.test"},
		),
		403,
	)
	status(
		t,
		admin.Do("DELETE", "/api/collectors/"+id, map[string]any{"confirmation_value": "wrong"}),
		400,
	)
	status(
		t,
		admin.Do(
			"DELETE",
			"/api/collectors/"+id,
			map[string]any{"confirmation_value": "COLLECTOR@example.test"},
		),
		200,
	)
	status(t, admin.Do("GET", "/api/collectors/"+id, nil), 404)
}

func TestCollectorPatchPreservesOmittedFields(t *testing.T) {
	app := testutil.Server(t)
	creator, _ := domainUser(t, app, "business")
	staff, _ := domainUser(t, app, "staff")
	phone := domainPhone()
	id := status(t, creator.Do("POST", "/api/collectors", collectorBody(" "+phone+" ")), 200).Body["id"].(string)
	before := status(t, creator.Do("GET", "/api/collectors/"+id, nil), 200)
	status(t, creator.Do("PATCH", "/api/collectors/"+id, map[string]any{"name": " Updated "}), 200)
	after := status(t, creator.Do("GET", "/api/collectors/"+id, nil), 200)
	for key, value := range before.Body {
		if key != "name" && after.Body[key] != value {
			t.Errorf("PATCH changed %s: %v -> %v", key, value, after.Body[key])
		}
	}

	if after.Body["name"] != "Updated" || after.Body["phone"] != "+27"+phone[1:] {
		t.Fatalf("patch: %s", after.Raw)
	}

	status(t, staff.Do("PATCH", "/api/collectors/"+id, map[string]any{"city": "Durban"}), 200)
	status(t, creator.Do("PATCH", "/api/collectors/"+id, map[string]any{"bank_name": ""}), 400)
	status(
		t,
		creator.Do(
			"PATCH",
			"/api/collectors/"+id,
			map[string]any{"payout_method": "ewallet",
				"ewallet_platform_name": "Wallet", "ewallet_payment_id": "0821234567"},
		),
		400,
	)
	status(t, creator.Do("PATCH", "/api/collectors/"+id, map[string]any{"province": "Invalid"}), 400)
	status(t, creator.Do("POST", "/api/collectors", collectorBody("+27 "+phone[1:])), 409)
	status(t, creator.Do("POST", "/api/collectors", collectorBody("123")), 400)

	// Business phone conflicts include legacy user rows without normalized_phone.
	status(t, creator.Do("POST", "/api/collectors", collectorBody("0837654321")), 200)
	_, err := app.DB.Pool.Exec(
		context.Background(),
		`UPDATE users SET phone='084 765 4321',
		normalized_phone=NULL WHERE role='business'`,
	)
	if err != nil {
		t.Fatal(err)
	}
	status(t, creator.Do("POST", "/api/collectors", collectorBody("0847654321")), 409)

	status(
		t,
		staff.Do(
			"POST",
			"/api/collectors",
			map[string]any{"name": "Wallet Collector", "phone": "0857654321",
				"payout_method": "ewallet", "ewallet_platform_name": "Wallet", "ewallet_payment_id": "0857654321"},
		),
		200,
	)
}

func TestCollectorStatsPhoneLeak(t *testing.T) {
	app := testutil.Server(t)
	creator, _ := domainUser(t, app, "business")
	other, _ := domainUser(t, app, "business")
	member, _ := domainUser(t, app, "")
	admin, _ := domainUser(t, app, "admin")
	staff, _ := domainUser(t, app, "staff")
	anonymous := app.NewClient(t)
	phone := domainPhone()
	id := status(t, creator.Do("POST", "/api/collectors", collectorBody(phone)), 200).Body["id"].(string)
	path := "/api/collectors/stats?phone=" + url.QueryEscape("+27"+phone[1:])

	status(t, anonymous.Do("GET", path, nil), 401)
	status(t, member.Do("GET", path, nil), 403)
	status(t, member.Do("GET", "/api/collectors/stats?phone=123", nil), 403)
	for _, phone := range []string{phone, domainPhone()} {
		result := status(t, other.Do("GET", "/api/collectors/stats?phone="+phone, nil), 200)
		if string(result.Raw) != "null" {
			t.Fatalf("phone existence leaked: %s", result.Raw)
		}
	}

	// Revenue must be summed once per transaction, even with several materials.
	material := domainMaterial(t, app, "Copper", "2")
	var businessID string
	if err := app.DB.Pool.QueryRow(
		context.Background(),
		`SELECT created_by_business_id FROM collectors WHERE id=$1`,
		id,
	).
		Scan(
			&businessID,
		); err != nil {
		t.Fatal(err)
	}
	transactionID := database.NewID()
	_, err := app.DB.Pool.Exec(
		context.Background(),
		`INSERT INTO transactions(id,seller_id,buyer_id,type,total_price)
		VALUES($1,$2,$3,'c2b',10.123456789)`,
		transactionID,
		id,
		businessID,
	)
	if err != nil {
		t.Fatal(err)
	}

	_, err = app.DB.Pool.Exec(
		context.Background(),
		`INSERT INTO transaction_items(transaction_id,position,material_id,weight,price)
		VALUES($1,0,$2,2.25,2),($1,1,$2,1.25,2)`,
		transactionID,
		material,
	)
	if err != nil {
		t.Fatal(err)
	}

	for _, client := range []*testutil.Client{creator, admin, staff} {
		result := status(t, client.Do("GET", path, nil), 200)
		totals := result.Body["totals"].(map[string]any)
		if totals["total_revenue"] != "10.123456789" || totals["transaction_count"] != float64(1) ||
			totals["total_volume"] != "3.50" || result.Body["carbon_savings"] != "7.00" {
			t.Fatalf("stats: %s", result.Raw)
		}
	}
}
