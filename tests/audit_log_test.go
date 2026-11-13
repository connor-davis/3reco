package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/crypt"
	collectorsstore "github.com/connor-davis/3reco/internal/stores/collectors"
	"github.com/connor-davis/3reco/tests/testutil"
)

// auditLine is one audit_log row, read back as plain JSON.
type auditLine struct {
	Actor  string
	Action string
	Key    map[string]any
	Old    map[string]any
	New    map[string]any
}

// auditLines reads the lines for one table and one primary-key value, oldest first.
func auditLines(t *testing.T, app *testutil.App, table, keyColumn, keyValue string) []auditLine {
	t.Helper()

	rows, err := app.DB.Pool.Query(context.Background(), `
		SELECT COALESCE(actor_id,''), action, row_key::text, COALESCE(old_values::text,'null'),
			COALESCE(new_values::text,'null')
		FROM audit_log WHERE table_name=$1 AND row_key->>$2=$3 ORDER BY id`, table, keyColumn, keyValue)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()

	var out []auditLine

	for rows.Next() {
		var line auditLine
		var key, oldValues, newValues string

		if err := rows.Scan(&line.Actor, &line.Action, &key, &oldValues, &newValues); err != nil {
			t.Fatal(err)
		}

		for _, part := range []struct {
			raw  string
			into *map[string]any
		}{{key, &line.Key}, {oldValues, &line.Old}, {newValues, &line.New}} {
			if err := json.Unmarshal([]byte(part.raw), part.into); err != nil {
				t.Fatal(err)
			}
		}

		out = append(out, line)
	}

	return out
}

func TestAuditStockLinesNameTheActorAndChangedColumns(t *testing.T) {
	w := newTradeWorld(t)
	material := tradeMaterial(t, w.app, "Tin", "3")

	status(t, w.seller.c.Do("POST", "/api/stock", map[string]any{
		"material_id": material, "weight": "10", "price": "4",
	}), 200)

	id := tradeText(t, w.app, `SELECT id FROM stock WHERE owner_id=$1 AND material_id=$2`,
		w.seller.id, material)

	status(t, w.seller.c.Do("PATCH", "/api/stock/"+id, map[string]any{"price": "6"}), 200)

	// The same values again change nothing, so they leave no line.
	status(t, w.seller.c.Do("PATCH", "/api/stock/"+id, map[string]any{"price": "6"}), 200)
	tradeExec(t, w.app, `UPDATE stock SET price = price WHERE id=$1`, id)

	status(t, w.seller.c.Do("DELETE", "/api/stock/"+id, nil), 200)

	lines := auditLines(t, w.app, "stock", "id", id)
	if len(lines) != 3 {
		t.Fatalf("want insert, update and delete, got %d lines: %+v", len(lines), lines)
	}

	for i, action := range []string{"insert", "update", "delete"} {
		if lines[i].Action != action || lines[i].Actor != w.seller.id {
			t.Fatalf("line %d: %+v, want %s by %s", i, lines[i], action, w.seller.id)
		}
	}

	if lines[0].Old != nil || lines[0].New["price"] != float64(4) || lines[2].New != nil {
		t.Fatalf("insert or delete values wrong: %+v", lines)
	}

	update := lines[1]
	if len(update.Old) != 1 || len(update.New) != 1 || update.Old["price"] != float64(4) || update.New["price"] != float64(6) {
		t.Fatalf("an update keeps only the changed columns: %+v", update)
	}
}

func TestAuditSystemWriteHasNoActor(t *testing.T) {
	w := newTradeWorld(t)

	tradeExec(t, w.app, `UPDATE stock SET weight = 90 WHERE id=$1`, w.stock)

	lines := auditLines(t, w.app, "stock", "id", w.stock)
	last := lines[len(lines)-1]

	if last.Action != "update" || last.Actor != "" || last.New["weight"] != float64(90) {
		t.Fatalf("a background write names the system: %+v", last)
	}
}

func TestAuditCompositeKey(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeSale(t, w.seller, w.buyer, w.material, "2", "8")

	lines := auditLines(t, w.app, "transaction_items", "transaction_id", id)
	if len(lines) != 1 || lines[0].Action != "insert" || lines[0].Actor != w.seller.id {
		t.Fatalf("sale item lines: %+v", lines)
	}

	_, hasPosition := lines[0].Key["position"]
	if lines[0].Key["transaction_id"] != id || !hasPosition {
		t.Fatalf("a composite key names every key column: %v", lines[0].Key)
	}
}

func TestAuditMask(t *testing.T) {
	app := testutil.Server(t)
	input := `{"id":"c1","password_hash":"x","token_hash":"y","avatar_key":"k","image_key":"k",
		"object_key":"k","street_address":"1 Main Road","city":"Paarl","province":"Western Cape",
		"bank_account_number":"v1:AbCdEf","ewallet_payment_id":"0821234567",
		"id_number":"9001015800087","business_registration_number":"2020/123456/07",
		"email":"jane.doe@example.com","phone":"+27 82 123 4567","normalized_phone":"+27821234567",
		"collector_snapshot":{"bank_account_number":"v1:zzz","phone":"+27821239999"}}`

	var raw string

	err := app.DB.Pool.QueryRow(context.Background(),
		`SELECT audit_mask('users', $1::jsonb)::text`, input).Scan(&raw)
	if err != nil {
		t.Fatal(err)
	}

	var got map[string]any
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatal(err)
	}

	for _, key := range []string{"password_hash", "token_hash", "avatar_key", "image_key", "object_key", "street_address"} {
		if _, found := got[key]; found {
			t.Errorf("%s was not dropped", key)
		}
	}

	want := map[string]any{
		"id": "c1", "city": "Paarl", "province": "Western Cape",
		"bank_account_number": "••••", "ewallet_payment_id": "•••• 4567",
		"id_number": "•••• 0087", "business_registration_number": "•••• 6/07",
		"email": "j***@example.com", "phone": "••• ••• 4567", "normalized_phone": "••• ••• 4567",
	}

	for key, value := range want {
		if got[key] != value {
			t.Errorf("%s = %v, want %v", key, got[key], value)
		}
	}

	snapshot, _ := got["collector_snapshot"].(map[string]any)
	if snapshot["bank_account_number"] != "••••" || snapshot["phone"] != "••• ••• 9999" {
		t.Errorf("the frozen collector copy is masked too: %v", snapshot)
	}

	var content string

	err = app.DB.Pool.QueryRow(context.Background(), `SELECT audit_mask('transaction_request_messages',
		'{"content":"hello there"}'::jsonb)->>'content'`).Scan(&content)
	if err != nil || strings.Contains(content, "hello") || content == "" {
		t.Errorf("a chat message body is never logged: %q %v", content, err)
	}
}

func TestAuditLogRefusesChanges(t *testing.T) {
	w := newTradeWorld(t)
	ctx := context.Background()

	tradeExec(t, w.app, `UPDATE stock SET weight = 91 WHERE id=$1`, w.stock)

	if _, err := w.app.DB.Pool.Exec(ctx, `UPDATE audit_log SET actor_id = 'x'`); err == nil {
		t.Error("an audit line was updated")
	}

	if _, err := w.app.DB.Pool.Exec(ctx, `DELETE FROM audit_log`); err == nil {
		t.Error("a recent audit line was deleted")
	}

	if _, err := w.app.DB.Pool.Exec(ctx, `TRUNCATE audit_log`); err == nil {
		t.Error("the audit log was truncated")
	}

	// Only a line older than 5 years can go: the retention job's delete.
	tradeExec(t, w.app, `INSERT INTO audit_log (at, table_name, row_key, action)
		VALUES (now() - interval '6 years', 'stock', '{"id":"old"}', 'insert')`)
	tradeExec(t, w.app, `DELETE FROM audit_log WHERE at < now() - make_interval(years => 5)`)

	if tradeText(t, w.app, `SELECT count(*)::text FROM audit_log WHERE row_key->>'id'='old'`) != "0" {
		t.Error("the old line was not purged")
	}
}

func TestActivityFeedAccessAndContent(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")

	status(t, w.app.NewClient(t).Do("GET", "/api/admin/activity", nil), 401)
	status(t, staff.c.Do("GET", "/api/admin/activity", nil), 403)
	status(t, w.seller.c.Do("GET", "/api/admin/activity", nil), 403)

	status(t, w.seller.c.Do("PATCH", "/api/stock/"+w.stock, map[string]any{"price": "12"}), 200)

	// An admin reading a collector in full is a privacy event.
	collector := privacyCollector(t, w.buyer.c)
	status(t, admin.c.Do("GET", "/api/collectors/"+collector, nil), 200)

	feed := pageItems(t, status(t, admin.c.Do("GET", "/api/admin/activity?limit=100", nil), 200))

	var sawChange, sawPrivacy bool

	for _, line := range feed {
		switch line["source"] {
		case "audit":
			sawChange = sawChange || line["table"] == "stock" && line["actor_id"] == w.seller.id
		case "privacy":
			sawPrivacy = sawPrivacy || line["action"] == "admin_full_view"
		}
	}

	if !sawChange || !sawPrivacy {
		t.Fatalf("the feed holds both sources: change=%v privacy=%v", sawChange, sawPrivacy)
	}

	onlyStock := pageItems(t, status(t, admin.c.Do("GET",
		"/api/admin/activity?table=stock&action=update&actor="+w.seller.id, nil), 200))
	if len(onlyStock) == 0 {
		t.Fatal("the filters hid the line they name")
	}

	for _, line := range onlyStock {
		if line["table"] != "stock" || line["action"] != "update" || line["actor_id"] != w.seller.id {
			t.Fatalf("a line escaped the filters: %v", line)
		}
	}

	byName := pageItems(t, status(t, admin.c.Do("GET", "/api/admin/activity?q=Biz%20"+w.seller.id[:6], nil), 200))
	if len(byName) == 0 {
		t.Fatal("searching the actor's name finds nothing")
	}

	status(t, admin.c.Do("GET", "/api/admin/activity?from=2020-01-01&to=2099-12-31", nil), 200)
	status(t, admin.c.Do("GET", "/api/admin/activity?from=yesterday", nil), 400)

	// The feed pages with a cursor and never repeats a line.
	first := status(t, admin.c.Do("GET", "/api/admin/activity?limit=2", nil), 200)
	next, _ := first.Body["next_cursor"].(string)

	if next == "" {
		t.Fatal("no next page")
	}

	seen := map[any]bool{}
	for _, line := range pageItems(t, first) {
		seen[line["id"]] = true
	}

	for _, line := range pageItems(t, status(t, admin.c.Do("GET", "/api/admin/activity?limit=2&cursor="+next, nil), 200)) {
		if seen[line["id"]] {
			t.Fatalf("line %v repeats on the next page", line["id"])
		}
	}
}

func TestCollectorListsCarryNoCiphertext(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	collector := privacyCollector(t, w.buyer.c)

	for name, who := range map[string]tradeUser{"creator": w.buyer, "admin": admin, "staff": staff} {
		for _, path := range []string{"/api/collectors", "/api/collectors/selection"} {
			raw := status(t, who.c.Do("GET", path, nil), 200).Raw
			if bytes.Contains(raw, []byte("v1:")) || bytes.Contains(raw, []byte("123456789")) {
				t.Errorf("%s list %s carries a payout number: %s", name, path, raw)
			}
		}
	}

	// A caller without full access gets the mask from the stored last four,
	// and the sealed number never leaves Postgres.
	view := status(t, staff.c.Do("GET", "/api/collectors/"+collector, nil), 200)
	if view.Body["bank_account_number"] != "******6789" || bytes.Contains(view.Raw, []byte("v1:")) {
		t.Fatalf("staff detail: %s", view.Raw)
	}

	// The creator still reads it in full for the edit form.
	own := status(t, w.buyer.c.Do("GET", "/api/collectors/"+collector, nil), 200)
	if own.Body["bank_account_number"] != "123456789" {
		t.Fatalf("creator detail: %s", own.Raw)
	}

	// The audit line keeps only the last four of the account.
	lines := auditLines(t, w.app, "collectors", "id", collector)
	if len(lines) == 0 {
		t.Fatal("creating a collector left no audit line")
	}

	for _, line := range lines {
		if line.New["bank_account_number"] != "••••" || line.New["bank_account_last4"] != "•••• 6789" ||
			line.New["street_address"] != nil {
			t.Fatalf("collector audit values: %v", line.New)
		}
	}
}

func TestCollectorLast4Backfill(t *testing.T) {
	w := newTradeWorld(t)
	collector := privacyCollector(t, w.buyer.c)

	tradeExec(t, w.app, `UPDATE collectors SET bank_account_last4 = NULL WHERE id=$1`, collector)

	cipher, err := crypt.New(testutil.FieldKey)
	if err != nil {
		t.Fatal(err)
	}

	filled, err := collectorsstore.New(w.app.DB, cipher).BackfillLast4(context.Background())
	if err != nil || filled != 1 {
		t.Fatalf("filled %d rows, err %v", filled, err)
	}

	if got := tradeText(t, w.app, `SELECT bank_account_last4 FROM collectors WHERE id=$1`, collector); got != "6789" {
		t.Fatalf("last four = %q", got)
	}
}
