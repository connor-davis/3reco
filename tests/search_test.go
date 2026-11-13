package tests

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

// searchField lists one JSON field of every item in a list response.
func searchField(res testutil.Response, field string) []string {
	var out []string

	for _, item := range tradeItems(res) {
		row, _ := item.(map[string]any)
		text, _ := row[field].(string)
		out = append(out, text)
	}

	return out
}

// searchWant checks how many rows a search returns.
func searchWant(t *testing.T, what string, res testutil.Response, want int) {
	t.Helper()

	tradeWant(t, what, res, 200)

	if got := len(tradeItems(res)); got != want {
		t.Errorf("%s: %d rows, want %d: %s", what, got, want, res.Raw)
	}
}

func searchNumber(t *testing.T, raw any) float64 {
	t.Helper()

	n, err := strconv.ParseFloat(fmt.Sprint(raw), 64)
	if err != nil {
		t.Fatalf("not a number: %v", raw)
	}

	return n
}

// A match that sits beyond the first page is found, filters compose, nobody
// else's rows appear, and the totals describe the whole filtered list.
func TestTransactionSearchFilters(t *testing.T) {
	w := newTradeWorld(t)
	third := tradeNewUser(t, w.app, "business")
	staff := tradeNewUser(t, w.app, "staff")
	quartz := tradeMaterial(t, w.app, "Quartz Dust", "5")
	tradeStock(t, w.app, w.seller.id, quartz, "100", "8")

	// The oldest rows: a collection, then the one quartz sale. Three newer glass
	// sales push both past a page of two.
	collector := tradeCollector(t, w.app, w.buyer, "+27800000077")
	tradeWant(t, "collection", w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "30", "6"))), 200)

	old := tradeSale(t, w.seller, w.buyer, quartz, "10", "8")
	for range 3 {
		tradeSale(t, w.seller, w.buyer, w.material, "5", "8")
	}

	// Somebody else's quartz trade must never show for a q that matches it.
	tradeStock(t, w.app, third.id, quartz, "100", "8")
	tradeSale(t, third, tradeNewUser(t, w.app, "business"), quartz, "7", "8")

	tradeExec(t, w.app, `UPDATE transactions SET created_at = '2020-03-15 10:00+02' WHERE id = $1`, old)

	purchases := "/api/transactions/purchases"

	got := w.buyer.c.Do("GET", purchases+"?q=quartz&limit=2", nil)
	searchWant(t, "material beyond page one", got, 1)

	if ids := searchField(got, "id"); len(ids) == 1 && ids[0] != old {
		t.Errorf("found %s, want %s", ids[0], old)
	}

	searchWant(t, "match is case blind", w.buyer.c.Do("GET", purchases+"?q=QUARTZ", nil), 1)
	searchWant(t, "seller name", w.buyer.c.Do("GET", purchases+"?q="+w.seller.id[:6], nil), 4)
	searchWant(t, "invoice number", w.buyer.c.Do("GET", purchases+"?q="+old[len(old)-8:], nil), 1)
	searchWant(t, "percent is literal", w.buyer.c.Do("GET", purchases+"?q=%25", nil), 0)

	// Filters compose.
	mine := "/api/transactions"
	searchWant(t, "type c2b beyond page one", w.buyer.c.Do("GET", mine+"?type=c2b&limit=2", nil), 1)
	searchWant(t, "type and q", w.buyer.c.Do("GET", mine+"?type=c2b&q=quartz", nil), 0)
	searchWant(t, "day range", w.buyer.c.Do("GET", mine+"?from=2020-03-15&to=2020-03-15", nil), 1)
	searchWant(t, "day range and q", w.buyer.c.Do("GET", mine+"?from=2020-03-15&to=2020-03-15&q=glass", nil), 0)
	searchWant(t, "from after it", w.buyer.c.Do("GET", mine+"?from=2020-03-16", nil), 4)
	searchWant(t, "to before it", w.buyer.c.Do("GET", mine+"?to=2020-03-14", nil), 0)

	// Other people's rows stay out, even when q matches them.
	searchWant(t, "outsider purchases", third.c.Do("GET", purchases+"?q=quartz", nil), 0)
	searchWant(t, "seller purchases", w.seller.c.Do("GET", purchases+"?q=quartz", nil), 0)
	searchWant(t, "third's own sales", third.c.Do("GET", "/api/transactions/sales?q=quartz", nil), 1)
	searchWant(t, "seller sales", w.seller.c.Do("GET", "/api/transactions/sales?q=quartz", nil), 1)
	searchWant(t, "staff sees every match", staff.c.Do("GET", mine+"?q=quartz", nil), 2)

	// Bad values are a 400, never an empty list.
	for _, query := range []string{"type=x", "from=yesterday", "to=2020-13-45", "from=2020-03-15T00:00:00Z"} {
		tradeWant(t, query, w.buyer.c.Do("GET", mine+"?"+query, nil), 400)
		tradeWant(t, "totals "+query, w.buyer.c.Do("GET", mine+"/totals?"+query, nil), 400)
	}

	tradeWant(t, "bad kind", w.buyer.c.Do("GET", mine+"/totals?kind=all", nil), 400)

	// Totals cover the whole filtered set, not a page.
	all := w.buyer.c.Do("GET", mine+"/totals?kind=purchases", nil)
	tradeWant(t, "totals", all, 200)

	if searchNumber(t, all.Body["count"]) != 5 || searchNumber(t, all.Body["weight"]) != 55 ||
		searchNumber(t, all.Body["value"]) != 380 {
		t.Errorf("all-time purchases totals %s, want 5 / 55 kg / 380", all.Raw)
	}

	one := w.buyer.c.Do("GET", mine+"/totals?kind=purchases&q=quartz", nil)
	if searchNumber(t, one.Body["count"]) != 1 || searchNumber(t, one.Body["weight"]) != 10 ||
		searchNumber(t, one.Body["value"]) != 80 {
		t.Errorf("quartz totals %s, want 1 / 10 kg / 80", one.Raw)
	}

	collections := w.buyer.c.Do("GET", mine+"/totals?type=c2b", nil)
	if searchNumber(t, collections.Body["count"]) != 1 || searchNumber(t, collections.Body["value"]) != 180 {
		t.Errorf("collection totals %s, want 1 / 180", collections.Raw)
	}

	outsider := third.c.Do("GET", mine+"/totals?kind=purchases&q=quartz", nil)
	if searchNumber(t, outsider.Body["count"]) != 0 {
		t.Errorf("outsider totals %s, want 0", outsider.Raw)
	}

	// Scope rules are unchanged: purchases stay a business list.
	tradeWant(t, "collector purchases", tradeNewUser(t, w.app, "collector").c.Do("GET", purchases+"?q=a", nil), 403)
	tradeWant(t, "anonymous totals", w.app.NewClient(t).Do("GET", mine+"/totals", nil), 401)
}

func TestStockSearchFilters(t *testing.T) {
	app := testutil.Server(t)
	owner := tradeNewUser(t, app, "business")
	other := tradeNewUser(t, app, "business")

	needle := tradeMaterial(t, app, "Needle Foam", "5")
	oldest := tradeStock(t, app, owner.id, needle, "10", "8")
	tradeExec(t, app, `UPDATE stock SET is_listed = false WHERE id = $1`, oldest)

	for i := range 3 {
		tradeStock(t, app, owner.id, tradeMaterial(t, app, fmt.Sprintf("Filler %d", i), "5"), "10", "8")
	}

	// Another owner holds the same material; it must never show for the first.
	tradeStock(t, app, other.id, needle, "10", "8")

	searchWant(t, "beyond page one", owner.c.Do("GET", "/api/stock?q=needle&limit=2", nil), 1)
	searchWant(t, "unlisted", owner.c.Do("GET", "/api/stock?status=unlisted&limit=2", nil), 1)
	searchWant(t, "listed", owner.c.Do("GET", "/api/stock?status=listed", nil), 3)
	searchWant(t, "q and status", owner.c.Do("GET", "/api/stock?q=needle&status=listed", nil), 0)
	searchWant(t, "q and unlisted", owner.c.Do("GET", "/api/stock?q=needle&status=unlisted", nil), 1)
	searchWant(t, "other owner", other.c.Do("GET", "/api/stock?q=needle", nil), 1)
	searchWant(t, "nobody's rows", tradeNewUser(t, app, "business").c.Do("GET", "/api/stock?q=needle", nil), 0)

	tradeWant(t, "bad status", owner.c.Do("GET", "/api/stock?status=maybe", nil), 400)
	tradeWant(t, "anonymous", app.NewClient(t).Do("GET", "/api/stock?q=needle", nil), 401)
}

func TestCollectorDirectorySearch(t *testing.T) {
	app := testutil.Server(t)
	business := tradeNewUser(t, app, "business")
	staff := tradeNewUser(t, app, "staff")

	add := func(name, email, city, account string) {
		tradeExec(t, app, `
			INSERT INTO collectors (id, name, email, phone, normalized_phone, city, province,
				bank_account_number, created_by_user_id)
			VALUES ($1, $2, $3, $4, $4, $5, 'Gauteng', $6, $7)`,
			database.NewID(), name, email, fmt.Sprintf("+2770%07d", tradePhones.Add(1)), city, account, business.id)
	}

	add("Zanele Target", "zanele@example.test", "Durban", testutil.Seal(t, "55501234"))

	for i := range 4 {
		add(fmt.Sprintf("Filler %d", i), fmt.Sprintf("f%d@example.test", i), "Pretoria", "")
	}

	for _, who := range []tradeUser{business, staff} {
		searchWant(t, "city beyond page one", who.c.Do("GET", "/api/collectors?q=durban&limit=2", nil), 1)
		searchWant(t, "name", who.c.Do("GET", "/api/collectors?q=zanele&limit=2", nil), 1)
		searchWant(t, "email", who.c.Do("GET", "/api/collectors?q=f2@example", nil), 1)
		searchWant(t, "province matches all", who.c.Do("GET", "/api/collectors?q=gauteng", nil), 5)

		// The selection list is a bare array, not a page.
		pick := who.c.Do("GET", "/api/collectors/selection?q=durban", nil)
		if !strings.Contains(string(pick.Raw), "Zanele") || strings.Contains(string(pick.Raw), "Filler") {
			t.Errorf("selection search: %s", pick.Raw)
		}

		// The sealed account number is never searchable, plain or sealed.
		searchWant(t, "account number", who.c.Do("GET", "/api/collectors?q=55501234", nil), 0)
	}

	searchWant(t, "no match", business.c.Do("GET", "/api/collectors?q=nobody", nil), 0)
	tradeWant(t, "collector role", tradeNewUser(t, app, "collector").c.Do("GET", "/api/collectors?q=durban", nil), 403)
	tradeWant(t, "anonymous", app.NewClient(t).Do("GET", "/api/collectors?q=durban", nil), 401)
}

func TestAdminUsersSearchFilters(t *testing.T) {
	app := testutil.Server(t)
	target := tradeNewUser(t, app, "business")
	tradeExec(t, app, `UPDATE businesses SET business_name = 'Zebra Recyclers' WHERE id = $1`, target.id)

	for range 4 {
		tradeNewUser(t, app, "business")
	}

	admin := tradeNewUser(t, app, "admin")

	searchWant(t, "business name beyond page one", admin.c.Do("GET", "/api/admin/users?q=zebra&limit=2", nil), 1)
	searchWant(t, "email", admin.c.Do("GET", "/api/admin/users?q="+url.QueryEscape(target.email), nil), 1)
	searchWant(t, "q and role", admin.c.Do("GET", "/api/admin/users?q=zebra&role=business", nil), 1)
	searchWant(t, "q and wrong role", admin.c.Do("GET", "/api/admin/users?q=zebra&role=collector", nil), 0)
	searchWant(t, "role only", admin.c.Do("GET", "/api/admin/users?role=admin", nil), 1)

	tradeExec(t, app, `UPDATE users SET is_removed = true WHERE id = $1`, target.id)
	searchWant(t, "removed user", admin.c.Do("GET", "/api/admin/users?q=zebra", nil), 0)

	tradeWant(t, "bad role", admin.c.Do("GET", "/api/admin/users?role=king", nil), 400)
	tradeWant(t, "staff", tradeNewUser(t, app, "staff").c.Do("GET", "/api/admin/users?q=zebra", nil), 403)
	tradeWant(t, "anonymous", app.NewClient(t).Do("GET", "/api/admin/users?q=zebra", nil), 401)
}

func TestMaterialsSearch(t *testing.T) {
	app := testutil.Server(t)

	tradeMaterial(t, app, "Aaa Needle Tin", "5")

	for i := range 3 {
		tradeMaterial(t, app, fmt.Sprintf("Bbb Filler %d", i), "5")
	}

	anon := app.NewClient(t)

	searchWant(t, "beyond page one", anon.Do("GET", "/api/materials?q=needle&limit=2", nil), 1)
	searchWant(t, "no match", anon.Do("GET", "/api/materials?q=zzzz", nil), 0)
	searchWant(t, "underscore is literal", anon.Do("GET", "/api/materials?q=_", nil), 0)
}
