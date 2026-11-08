package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestRound17CollectionLineCaps(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000171")
	tradeStock(t, w.app, w.buyer.id, w.material, "10", "8")

	for _, test := range []struct{ field, value, message string }{
		{"weight", "1000000.01", "Weight must be 1 000 000 kg or less."},
		{"price", "100000.01", "Price must be R 100 000.00 per kg or less."},
	} {
		line := tradeLine(w.material, "1", "8")
		line[test.field] = test.value
		result := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
			tradeCollection(collector, "", line)), 400)
		fields, _ := result.Body["fields"].(map[string]any)
		if fields[test.field] != test.message {
			t.Fatalf("limit error: %s", result.Raw)
		}
	}

	if count := tradeText(t, w.app, `SELECT count(*)::text FROM transactions`); count != "0" {
		t.Fatal("refused lines wrote transactions")
	}

	// Entry caps do not limit the stock accumulated through valid collections.
	status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "1000000", "100000.00"))), 200)
	holdDecimal(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "1000010")
	status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "0.01", "1"))), 200)
	holdDecimal(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "1000010.01")

	// An unrelated business cannot target another business's stock.
	stranger := tradeNewUser(t, w.app, "business")
	status(t, stranger.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, w.buyer.id, tradeLine(w.material, "1", "8"))), 200)
	holdDecimal(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "1000010.01")
	holdDecimal(t, tradeStockWeight(t, w.app, stranger.id, w.material), "1")
	login := tradeNewUser(t, w.app, "collector")
	status(t, login.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, w.buyer.id, tradeLine(w.material, "1", "8"))), 403)
}

func TestRound17CollectorPayoutMerge(t *testing.T) {
	app := testutil.Server(t)
	owner, _ := domainUser(t, app, "business")
	staff, _ := domainUser(t, app, "staff")
	other, _ := domainUser(t, app, "business")
	id := status(t, owner.Do("POST", "/api/collectors", collectorBody("0827770171")), 200).
		Body["id"].(string)
	path := "/api/collectors/" + id

	for _, body := range []map[string]any{
		{"payout_method": "none"},
		{"payout_method": "ewallet", "ewallet_platform_name": "FNB eWallet",
			"ewallet_payment_id": "0827770172"},
	} {
		result := status(t, staff.Do("PATCH", path, body), 403)
		if result.Body["message"] != "You cannot change private payout identifiers." {
			t.Fatalf("staff payout denial: %s", result.Raw)
		}
		status(t, other.Do("PATCH", path, body), 404)
	}

	for _, body := range []map[string]any{{"payout_method": ""}, {"city": "Paarl"}} {
		status(t, owner.Do("PATCH", path, body), 200)
		row := status(t, owner.Do("GET", path, nil), 200).Body
		if row["payout_method"] != "bank" || row["bank_account_number"] != "123456789" {
			t.Fatalf("empty or omitted method lost bank details: %v", row)
		}
	}

	masked := status(t, staff.Do("GET", path, nil), 200).Body
	status(t, staff.Do("PATCH", path, map[string]any{
		"payout_method": "bank", "bank_account_number": masked["bank_account_number"],
		"bank_branch_code": masked["bank_branch_code"],
	}), 200)

	// Empty fields cannot clear a saved payout, even with an empty method.
	for _, method := range []string{"", "bank"} {
		result := status(t, owner.Do("PATCH", path, map[string]any{
			"payout_method": method, "bank_account_holder_name": "", "bank_name": "",
			"bank_account_number": "", "bank_branch_code": "", "bank_account_type": "",
		}), 400)
		if fields, _ := result.Body["fields"].(map[string]any); len(fields) != 5 {
			t.Fatalf("missing bank field errors: %s", result.Raw)
		}
	}

	status(t, owner.Do("PATCH", path, map[string]any{
		"payout_method": "ewallet", "ewallet_platform_name": "FNB eWallet",
		"ewallet_payment_id": "0827770172",
	}), 200)
	row := status(t, owner.Do("GET", path, nil), 200).Body
	if row["payout_method"] != "ewallet" || row["ewallet_payment_id"] != "0827770172" {
		t.Fatalf("complete wallet did not replace bank: %v", row)
	}
	for _, key := range []string{"bank_account_holder_name", "bank_name", "bank_account_number",
		"bank_branch_code", "bank_account_type"} {
		if value, _ := row[key].(string); value != "" {
			t.Fatalf("wallet retained %s: %v", key, row)
		}
	}

	status(t, owner.Do("PATCH", path, map[string]any{"payout_method": "none"}), 200)
	row = status(t, owner.Do("GET", path, nil), 200).Body
	for _, key := range []string{"payout_method", "bank_account_holder_name", "bank_name",
		"bank_account_number", "bank_branch_code", "bank_account_type",
		"ewallet_platform_name", "ewallet_payment_id"} {
		if value, _ := row[key].(string); value != "" {
			t.Fatalf("explicit none retained %s: %v", key, row)
		}
	}

	if got := tradeText(t, app, `SELECT (payout_method IS NULL)::text FROM collectors WHERE id=$1`, id); got != "true" {
		t.Fatal("none was not stored as NULL")
	}

	// Clearing a bank payout removes all five bank fields too.
	body := collectorBody("0827770174")
	body["email"] = "clear-bank@example.test"
	bankID := status(t, owner.Do("POST", "/api/collectors", body), 200).Body["id"].(string)
	bankPath := "/api/collectors/" + bankID
	status(t, owner.Do("PATCH", bankPath, map[string]any{"payout_method": "none"}), 200)
	row = status(t, owner.Do("GET", bankPath, nil), 200).Body
	for _, key := range []string{"payout_method", "bank_account_holder_name", "bank_name",
		"bank_account_number", "bank_branch_code", "bank_account_type"} {
		if value, _ := row[key].(string); value != "" {
			t.Fatalf("explicit none retained bank %s: %v", key, row)
		}
	}
}

func TestRound17CollectorOptionalPayout(t *testing.T) {
	app := testutil.Server(t)
	owner, _ := domainUser(t, app, "business")
	staff, _ := domainUser(t, app, "staff")

	for _, method := range []string{"", "none", "bank", "ewallet"} {
		body := map[string]any{"name": "Optional payout", "email": method + "new@example.test",
			"payout_method": method}
		want := 200
		if method == "bank" || method == "ewallet" {
			want = 400
		}
		result := status(t, owner.Do("POST", "/api/collectors", body), want)
		if want == 400 {
			fields, _ := result.Body["fields"].(map[string]any)
			key := "bank_account_number"
			if method == "ewallet" {
				key = "ewallet_payment_id"
			}
			if fields[key] == nil || result.Body["message"] != "Please fix the highlighted fields." {
				t.Fatalf("picked empty method: %s", result.Raw)
			}
		}
	}

	result := status(t, owner.Do("POST", "/api/collectors", map[string]any{
		"name": "Choose method", "email": "choose@example.test", "bank_name": "FNB",
	}), 400)
	if fields, _ := result.Body["fields"].(map[string]any); fields["payout_method"] != "Choose a payout method." {
		t.Fatalf("details without method: %s", result.Raw)
	}

	// Creators, including staff, may explicitly choose none on a new record.
	body := collectorBody("0827770173")
	body["payout_method"] = "none"
	status(t, staff.Do("POST", "/api/collectors", body), 200)
}
