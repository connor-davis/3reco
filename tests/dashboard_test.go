package tests

import (
	"math/big"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

func tradeDash(t *testing.T, u tradeUser, path string) map[string]any {
	t.Helper()

	res := u.c.Do("GET", path, nil)
	tradeWant(t, path, res, 200)

	return res.Body
}

func TestDashboardAccess(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	collector := tradeNewUser(t, w.app, "collector")
	anon := w.app.NewClient(t)

	tradeWant(t, "admin dashboard", admin.c.Do("GET", "/api/admin/dashboard", nil), 200)
	tradeWant(t, "staff dashboard", staff.c.Do("GET", "/api/admin/dashboard", nil), 200)
	tradeWant(t, "business admin dashboard", w.buyer.c.Do("GET", "/api/admin/dashboard", nil), 403)
	tradeWant(t, "collector admin dashboard", collector.c.Do("GET", "/api/admin/dashboard", nil), 403)

	tradeWant(t, "business dashboard", w.buyer.c.Do("GET", "/api/dashboard/business", nil), 200)
	tradeWant(t, "collector on business", collector.c.Do("GET", "/api/dashboard/business", nil), 403)
	tradeWant(t, "admin on business", admin.c.Do("GET", "/api/dashboard/business", nil), 403)

	tradeWant(t, "collector dashboard", collector.c.Do("GET", "/api/dashboard/collector", nil), 200)
	tradeWant(t, "business on collector", w.buyer.c.Do("GET", "/api/dashboard/collector", nil), 403)

	for _, p := range []string{"/api/admin/dashboard", "/api/dashboard/business", "/api/dashboard/collector"} {
		tradeWant(t, "anonymous "+p, anon.Do("GET", p, nil), 401)
	}

	tradeWant(t, "bad date", w.buyer.c.Do("GET", "/api/dashboard/business?from=soon", nil), 400)
	tradeWant(t, "backwards", w.buyer.c.Do("GET",
		"/api/dashboard/business?from=2026-03-05&to=2026-03-01", nil), 400)
	tradeWant(t, "too long", w.buyer.c.Do("GET",
		"/api/dashboard/business?from=2020-01-01&to=2026-01-01", nil), 400)

	// Nothing traded: the default window is 30 days of zeros.
	body := tradeDash(t, w.buyer, "/api/dashboard/business")
	if series, _ := body["series"].([]any); len(series) != 30 {
		t.Errorf("default series has %d days, want 30", len(series))
	}

	// The collector with no linked row sees zeros and is told so.
	body = tradeDash(t, collector, "/api/dashboard/collector")
	if body["collector_linked"] != false {
		t.Errorf("collector_linked %v, want false", body["collector_linked"])
	}
}

func dashboardActions(t *testing.T, u tradeUser, path string) map[string]any {
	t.Helper()

	body := tradeDash(t, u, path)
	actions, ok := body["actions"].(map[string]any)
	if !ok {
		t.Fatalf("business dashboard has no actions: %v", body)
	}

	return actions
}

func TestDashboardRequestsWaiting(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	other := tradeNewUser(t, w.app, "business")
	otherStock := tradeStock(t, w.app, other.id, w.material, "100", "8")
	tradeRequest(t, w.buyer, other, otherStock)

	check := func(seller, buyer int) {
		t.Helper()

		for _, tc := range []struct {
			user tradeUser
			want int
		}{{w.seller, seller}, {w.buyer, buyer}} {
			got := dashboardActions(t, tc.user, "/api/dashboard/business")["requests_waiting"]
			if got != float64(tc.want) {
				t.Fatalf("%s waiting=%v, want %d", tc.user.id, got, tc.want)
			}
		}
	}

	// Pending incoming needs the seller, not the buyer or another seller.
	check(1, 0)
	tradeOffer(t, w.seller, id, w.material, "1", "8")
	check(0, 1)
	tradeWant(t, "buyer confirms", w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	check(1, 0)
	tradeWant(t, "seller confirms", w.seller.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)
	check(0, 0)

	// Counter-offers reverse who responds first; confirming an older version
	// does not confirm the current offer.
	id = tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.buyer, id, w.material, "1", "8")
	check(1, 0)
	res := w.seller.c.Do("POST", "/api/requests/"+id+"/accept", nil)
	tradeWant(t, "seller accepts buyer offer", res, 200)
	check(0, 1)
	tradeExec(t, w.app, `UPDATE transaction_requests
		SET buyer_confirmed_version=offer_version-1 WHERE id=$1`, id)
	check(0, 1)
	tradeExec(t, w.app, `UPDATE stock_holds
		SET expires_at=clock_timestamp()-interval '1 second' WHERE request_id=$1`, id)
	check(0, 0)

	// A hold on only one line cannot confirm a two-line offer.
	tradeExec(t, w.app, `UPDATE stock_holds
		SET expires_at=clock_timestamp()+interval '1 hour' WHERE request_id=$1`, id)
	material := tradeMaterial(t, w.app, "Paper", "5")
	tradeExec(t, w.app, `INSERT INTO transaction_request_items
		(request_id,position,material_id,offer_weight,offer_price) VALUES ($1,1,$2,1,8)`, id, material)
	check(0, 0)

	// Terminal states and missing offer makers never count as actionable.
	for _, status := range []string{"accepted", "rejected", "cancelled"} {
		tradeExec(t, w.app, `UPDATE transaction_requests SET status=$2 WHERE id=$1`, id, status)
		check(0, 0)
	}

	tradeExec(t, w.app, `UPDATE transaction_requests
		SET status='offered',offer_by=NULL WHERE id=$1`, id)
	check(0, 0)
}

func TestDashboardBusinessActionsAreTenantScoped(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	third := tradeNewUser(t, w.app, "business")

	// DirectSale queues invoice generation after commit. Insert these historical
	// trades directly so the invoice worker cannot race the missing-key fixture.
	sale := func(seller, buyer tradeUser) string {
		id := database.NewID()
		tradeExec(t, w.app, `INSERT INTO transactions
			(id,seller_id,buyer_id,type,total_price,status,created_at)
			VALUES ($1,$2,$3,'b2b',16,'complete','2021-01-01T10:00:00Z')`,
			id, seller.id, buyer.id)

		return id
	}

	// Both bought and sold business trades count, across all dates.
	sale(w.seller, w.buyer)
	invoiced := sale(w.seller, w.buyer)
	tradeExec(t, w.app, `UPDATE transactions SET invoice_key='generated.pdf' WHERE id=$1`, invoiced)
	sale(w.buyer, w.seller)

	// Another business's requests, stock, collectors and trades contribute nothing.
	stock := tradeStock(t, w.app, other.id, w.material, "100", "8")
	tradeRequest(t, third, other, stock)
	sale(other, third)
	collector := tradeCollector(t, w.app, other, "+27800000821")
	tradeWant(t, "other collection", other.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "1", "8"))), 200)

	unlisted := tradeStock(t, w.app, w.seller.id, w.material, "2", "8")
	tradeExec(t, w.app, `UPDATE stock SET is_listed=false WHERE id=$1`, unlisted)

	for _, path := range []string{
		"/api/dashboard/business",
		"/api/dashboard/business?business_id=" + other.id + "&from=2020-01-01&to=2020-01-02",
	} {
		actions := dashboardActions(t, w.seller, path)
		wantActions := map[string]int{"requests_waiting": 0, "trades_to_invoice": 2, "listings": 1}
		for key, want := range wantActions {
			if actions[key] != float64(want) {
				t.Errorf("%s: %s=%v, want %d", path, key, actions[key], want)
			}
		}

		if body := tradeDash(t, w.seller, path); body["collects"] != false {
			t.Errorf("another business enabled collects: %v", body["collects"])
		}
	}

	for _, status := range []string{"pending", "cancelled"} {
		tradeExec(t, w.app, `INSERT INTO transactions
			(id,seller_id,buyer_id,type,total_price,status) VALUES ($1,$2,$3,'b2b',8,$4)`,
			database.NewID(), w.seller.id, w.buyer.id, status)
	}

	// Collector receipts do not count as business invoices to prepare.
	tradeOldSale(t, w.app, collector, w.seller, w.material, "2021-01-01T10:00:00Z", nil, nil)
	actions := dashboardActions(t, w.seller, "/api/dashboard/business")
	if actions["trades_to_invoice"] != float64(2) {
		t.Errorf("invoice count includes pending, cancelled or collector trades: %v", actions)
	}
}

func TestDashboardCollectPresence(t *testing.T) {
	w := newTradeWorld(t)
	otherCollector := tradeCollector(t, w.app, w.seller, "+27800000822")
	check := func(want bool) {
		t.Helper()

		body := tradeDash(t, w.buyer, "/api/dashboard/business?from=2020-01-01&to=2020-01-02")
		if body["collects"] != want {
			t.Fatalf("collects=%v, want %v", body["collects"], want)
		}
	}

	check(false)
	mine := tradeCollector(t, w.app, w.buyer, "+27800000823")
	check(true)
	tradeExec(t, w.app, `DELETE FROM collectors WHERE id=$1`, mine)
	check(false)

	// Historical collections count even when the current collector belongs
	// to a different creator, outside the displayed date range.
	tradeOldSale(t, w.app, otherCollector, w.buyer, w.material, "2021-01-01T10:00:00Z", nil, nil)
	check(true)
	tradeExec(t, w.app, `UPDATE transactions SET status='cancelled' WHERE buyer_id=$1`, w.buyer.id)
	check(false)

	for _, role := range []string{"admin", "staff", "collector"} {
		u := tradeNewUser(t, w.app, role)
		path := "/api/admin/dashboard"
		if role == "collector" {
			path = "/api/dashboard/collector"
		}

		body := tradeDash(t, u, path)
		for _, key := range []string{"actions", "collects"} {
			if _, present := body[key]; present {
				t.Errorf("%s dashboard exposes business field %s", role, key)
			}
		}
	}
}

func TestDashboardActionsFollowActiveBusiness(t *testing.T) {
	w := newTradeWorld(t)
	person := tradeNewUser(t, w.app, "business")
	tradeExec(t, w.app, `INSERT INTO business_members VALUES($1,$2,'member')`, w.seller.id, person.id)
	tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeCollector(t, w.app, w.seller, "+27800000824")

	if got := dashboardActions(t, person, "/api/dashboard/business")["listings"]; got != float64(0) {
		t.Fatalf("unselected business's listings leaked: %v", got)
	}

	res := person.c.Do("POST", "/api/businesses/"+w.seller.id+"/select", nil)
	tradeWant(t, "select member workspace", res, 200)
	body := tradeDash(t, person, "/api/dashboard/business?business_id="+w.buyer.id)
	actions := body["actions"].(map[string]any)
	if actions["listings"] != float64(1) || actions["requests_waiting"] != float64(1) ||
		body["collects"] != true {
		t.Errorf("dashboard did not follow selected member workspace: %v", body)
	}
}

// Hole 13: a purchase names its seller and a sale names its buyer.
func TestBusinessDashboardCounterparty(t *testing.T) {
	w := newTradeWorld(t)
	third := tradeNewUser(t, w.app, "business")

	// buyer buys from seller, then sells part of it on to third.
	tradeSale(t, w.seller, w.buyer, w.material, "20", "8")
	tradeSale(t, w.buyer, third, w.material, "5", "9")

	body := tradeDash(t, w.buyer, "/api/dashboard/business")
	names := map[string]string{}

	cps, _ := body["counterparties"].([]any)
	for _, c := range cps {
		row, _ := c.(map[string]any)
		names[row["id"].(string)], _ = row["name"].(string)
	}

	if len(names) != 2 {
		t.Fatalf("counterparties %v, want the seller and the third business", names)
	}

	if names[w.seller.id] != "Biz "+w.seller.id[:6] {
		t.Errorf("purchase counterparty %q, want the seller's name", names[w.seller.id])
	}

	if names[third.id] != "Biz "+third.id[:6] {
		t.Errorf("sale counterparty %q, want the buyer's name", names[third.id])
	}

	if _, own := names[w.buyer.id]; own {
		t.Errorf("the business is listed as its own counterparty")
	}

	totals, _ := body["totals"].(map[string]any)
	if totals["count"] != float64(2) {
		t.Errorf("totals %v, want 2 trades", totals)
	}

	// The third business sees only its own trade, with the seller as counterparty.
	other := tradeDash(t, third, "/api/dashboard/business")
	if t2, _ := other["totals"].(map[string]any); t2["count"] != float64(1) {
		t.Errorf("third business totals %v, want 1 trade", t2)
	}
}

// tradeOldSale inserts a collector sale with exact times, so the day it falls
// on can be checked.
func tradeOldSale(
	t *testing.T,
	app *testutil.App,
	collector string,
	buyer tradeUser,
	material, createdAt string,
	collectionDate, collectionDay *string,
) {
	t.Helper()

	id := database.NewID()

	tradeExec(t, app, `
		INSERT INTO transactions
			(id, seller_id, buyer_id, type, total_price, collection_date, collection_day, created_at, status)
		VALUES ($1, $2, $3, 'c2b', 60, $4::timestamptz, $5::date, $6::timestamptz, 'complete')`,
		id, collector, buyer.id, collectionDate, collectionDay, createdAt)
	tradeExec(t, app, `
		INSERT INTO transaction_items (transaction_id, position, material_id, weight, price)
		VALUES ($1, 0, $2, 10, 6)`, id, material)
}

// Hole 18: days are South African days, from midnight to midnight.
func TestDashboardSASTDayBounds(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000018")

	str := func(s string) *string { return &s }

	// 22:30 UTC on 1 March is 00:30 on 2 March in South Africa.
	tradeOldSale(t, w.app, collector, w.buyer, w.material, "2026-03-01T10:00:00Z",
		str("2026-03-01T22:30:00Z"), nil)
	// Exactly midnight in South Africa starts 2 March.
	tradeOldSale(t, w.app, collector, w.buyer, w.material, "2026-03-01T10:00:00Z",
		str("2026-03-01T22:00:00Z"), nil)
	// One minute earlier is still 1 March.
	tradeOldSale(t, w.app, collector, w.buyer, w.material, "2026-03-01T10:00:00Z",
		str("2026-03-01T21:59:00Z"), nil)
	// A collection day counts on that date whatever the created time says.
	tradeOldSale(t, w.app, collector, w.buyer, w.material, "2026-03-01T10:00:00Z",
		nil, str("2026-03-05"))

	day := func(series []any, date string) map[string]any {
		for _, s := range series {
			row, _ := s.(map[string]any)
			if row["day"] == date {
				return row
			}
		}

		t.Fatalf("series has no day %s", date)

		return nil
	}

	body := tradeDash(t, w.buyer, "/api/dashboard/business?from=2026-03-01&to=2026-03-05")
	series, _ := body["series"].([]any)

	if len(series) != 5 {
		t.Fatalf("series has %d days, want 5", len(series))
	}

	want := map[string]float64{
		"2026-03-01": 1, "2026-03-02": 2, "2026-03-03": 0, "2026-03-04": 0, "2026-03-05": 1,
	}
	for date, n := range want {
		if got := day(series, date)["count"]; got != n {
			t.Errorf("%s holds %v trades, want %v", date, got, n)
		}
	}

	if got := day(series, "2026-03-03")["value"]; got != "0" {
		t.Errorf("an empty day has value %v, want the string 0", got)
	}

	totals, _ := body["totals"].(map[string]any)
	if totals["count"] != float64(4) || totals["value"] != "240.00" ||
		totals["weight"] != "40.000" || totals["carbon_savings"] != "80" {
		t.Errorf("totals %v, want 4 trades, 240.00, 40.000 kg and 80 carbon", totals)
	}

	// A single day takes exactly that South African day.
	one := tradeDash(t, w.buyer, "/api/dashboard/business?from=2026-03-02&to=2026-03-02")
	if t1, _ := one["totals"].(map[string]any); t1["count"] != float64(2) {
		t.Errorf("2 March totals %v, want 2 trades", t1)
	}

	// The admin sees the same trades.
	admin := tradeNewUser(t, w.app, "admin")
	all := tradeDash(t, admin, "/api/admin/dashboard?from=2026-03-01&to=2026-03-05")

	if ta, _ := all["totals"].(map[string]any); ta["count"] != float64(4) {
		t.Errorf("admin totals %v, want 4 trades", ta)
	}

	if users, _ := all["users"].([]any); len(users) == 0 {
		t.Errorf("admin dashboard has no user counts")
	}
}

func TestCollectorDashboardOwnTradesOnly(t *testing.T) {
	w := newTradeWorld(t)
	mine := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, mine.phone)
	other := tradeCollector(t, w.app, w.buyer, "+27800000019")

	line := tradeLine(w.material, "10", "6")
	tradeWant(t, "mine", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", line)), 200)
	tradeWant(t, "other", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(other, "", line)), 200)

	body := tradeDash(t, mine, "/api/dashboard/collector")
	totals, _ := body["totals"].(map[string]any)

	if totals["count"] != float64(1) || totals["value"] != "60.00" {
		t.Errorf("collector totals %v, want 1 trade worth 60.00", totals)
	}

	if body["collector_linked"] != true {
		t.Errorf("collector_linked %v, want true", body["collector_linked"])
	}
}

func TestAdminDashboardSplitsByType(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")

	tradeSale(t, w.seller, w.buyer, w.material, "20", "8")

	collector := tradeCollector(t, w.app, w.buyer, "+27800000092")
	res := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "3.5", "2")))
	tradeWant(t, "collection", res, 200)

	for _, u := range []tradeUser{admin, staff} {
		body := tradeDash(t, u, "/api/admin/dashboard")
		rows, _ := body["by_type"].([]any)

		got := map[string]float64{}
		for _, r := range rows {
			row, _ := r.(map[string]any)
			got[row["type"].(string)], _ = row["count"].(float64)
		}

		if got["b2b"] < 1 || got["c2b"] < 1 {
			t.Errorf("by_type %v, want at least one b2b and one c2b", got)
		}
	}

	// A business dashboard carries no platform-wide split.
	if _, has := tradeDash(t, w.buyer, "/api/dashboard/business")["by_type"]; has {
		t.Error("business dashboard exposes by_type")
	}
}

// A business sees only its own stock mix, week, collectors and previous totals.
func TestBusinessDashboardMetricsAreTenantScoped(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	paper := tradeMaterial(t, w.app, "Paper", "2")

	// Stock: the buyer holds 7 kg of two materials, the other business 99 kg.
	tradeStock(t, w.app, w.buyer.id, paper, "7.5", "2")
	tradeStock(t, w.app, other.id, paper, "99", "2")

	// Collections today: the buyer collects 10 kg of one material and 4 of
	// paper; the other business collects 50 kg.
	mine := tradeCollector(t, w.app, w.buyer, "+27800000071")
	theirs := tradeCollector(t, w.app, other, "+27800000072")

	tradeWant(t, "mine", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(mine, "", tradeLine(w.material, "10", "6"), tradeLine(paper, "4", "2"))), 200)
	tradeWant(t, "theirs", other.c.Do("POST", "/api/transactions/collections",
		tradeCollection(theirs, "", tradeLine(w.material, "50", "6"))), 200)

	body := tradeDash(t, w.buyer, "/api/dashboard/business")

	mix, _ := body["stock_mix"].([]any)
	for _, r := range mix {
		row, _ := r.(map[string]any)
		if row["material_id"] == paper && row["weight"] != "11.500" && row["weight"] != "11.5" {
			t.Errorf("paper stock %v, want only the buyer's 7.5 plus its collected 4", row["weight"])
		}
	}

	if len(mix) == 0 {
		t.Fatal("business has no stock mix")
	}

	week, _ := body["week"].(map[string]any)
	if week == nil {
		t.Fatal("business dashboard has no week")
	}

	// The week may have just rolled over; this + last holds every kg once.
	this, _ := new(big.Rat).SetString(week["this_kg"].(string))
	last, _ := new(big.Rat).SetString(week["last_kg"].(string))

	if sum := new(big.Rat).Add(this, last); sum.Cmp(big.NewRat(14, 1)) != 0 && this.Cmp(big.NewRat(14, 1)) != 0 {
		t.Errorf("week kg %v + %v, want 14 and none of the other business's 50", this, last)
	}

	mats, _ := week["materials"].([]any)
	for _, m := range mats {
		row, _ := m.(map[string]any)
		if w, _ := new(big.Rat).SetString(row["weight"].(string)); w.Cmp(big.NewRat(14, 1)) > 0 {
			t.Errorf("week material %v leaks another business's kg", row)
		}
	}

	totals, _ := body["totals"].(map[string]any)
	if totals["active_collectors"] != float64(1) {
		t.Errorf("active collectors %v, want 1", totals["active_collectors"])
	}

	if prev, _ := body["previous"].(map[string]any); prev["count"] != float64(0) ||
		prev["active_collectors"] != float64(0) {
		t.Errorf("previous %v, want zeros for the period before", prev)
	}

	// The other business sees its own 50 kg and one collector.
	theirBody := tradeDash(t, other, "/api/dashboard/business")
	if tt, _ := theirBody["totals"].(map[string]any); tt["active_collectors"] != float64(1) {
		t.Errorf("other active collectors %v, want 1", tt["active_collectors"])
	}

	// Admin counts both collectors; a collector gets none of these fields.
	admin := tradeNewUser(t, w.app, "admin")
	if at, _ := tradeDash(t, admin, "/api/admin/dashboard")["totals"].(map[string]any); at["active_collectors"].(float64) < 2 {
		t.Errorf("admin active collectors %v, want at least 2", at["active_collectors"])
	}

	adminBody := tradeDash(t, admin, "/api/admin/dashboard")
	if _, has := adminBody["week"]; has {
		t.Error("admin dashboard exposes week")
	}

	if _, has := adminBody["stock_mix"]; !has {
		t.Error("admin dashboard has no marketplace stock mix")
	}

	col := tradeNewUser(t, w.app, "collector")

	cb := tradeDash(t, col, "/api/dashboard/collector")
	for _, k := range []string{"week", "stock_mix"} {
		if _, has := cb[k]; has {
			t.Errorf("collector dashboard exposes %s", k)
		}
	}

	if ct, _ := cb["totals"].(map[string]any); ct["active_collectors"] != nil {
		t.Errorf("collector totals carry active_collectors %v", ct["active_collectors"])
	}

	if _, has := cb["previous"]; !has {
		t.Error("collector dashboard has no previous totals")
	}
}
