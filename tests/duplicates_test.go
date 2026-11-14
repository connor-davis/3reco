package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"slices"
	"sync"
	"testing"

	adminsvc "github.com/connor-davis/3reco/internal/services/admin"
	"github.com/connor-davis/3reco/tests/testutil"
)

func duplicateCollection(t *testing.T, w tradeWorld, collector string, lines ...map[string]any) string {
	t.Helper()

	res := w.buyer.c.Do("POST", "/api/transactions/collections", tradeCollection(collector, "", lines...))
	if res.Status != 200 {
		t.Fatalf("collection: %d %s", res.Status, res.Raw)
	}

	return res.Body["transaction_id"].(string)
}

func duplicateReview(t *testing.T, admin tradeUser) adminsvc.DuplicateReview {
	t.Helper()

	res := admin.c.Do("GET", "/api/admin/duplicates", nil)
	tradeWant(t, "review", res, 200)
	var review adminsvc.DuplicateReview
	if err := json.Unmarshal(res.Raw, &review); err != nil {
		t.Fatal(err)
	}

	return review
}

func duplicateMark(t *testing.T, admin tradeUser, id, original string, want int) {
	t.Helper()

	res := admin.c.Do("POST", "/api/admin/duplicates/"+id+"/mark",
		map[string]any{"original_id": original})
	tradeWant(t, "mark", res, want)
}

func duplicateNumber(t *testing.T, got, want string) {
	t.Helper()

	value, ok := new(big.Rat).SetString(got)
	expected, _ := new(big.Rat).SetString(want)
	if !ok || value.Cmp(expected) != 0 {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestDuplicateMatchingAndDismissal(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000901")
	other := tradeMaterial(t, w.app, "Paper", "1")
	first := duplicateCollection(t, w, collector,
		tradeLine(w.material, "4", "5"), tradeLine(other, "2", "1"))
	second := duplicateCollection(t, w, collector,
		tradeLine(other, "2.00", "1.00"), tradeLine(w.material, "4.00", "5.00"))
	third := duplicateCollection(t, w, collector,
		tradeLine(w.material, "4", "5"), tradeLine(other, "2", "1"))

	review := duplicateReview(t, admin)
	if len(review.Groups) != 1 || review.Groups[0].Kind != "exact" ||
		len(review.Groups[0].Trades) != 3 || review.Groups[0].OriginalID != first {
		t.Fatalf("expected three numeric/order-independent copies: %+v", review)
	}

	// Calendar collection day wins over recording time, including hours-apart copies.
	tradeExec(t, w.app, `UPDATE transactions SET collection_day='2026-11-01',
		created_at=CASE WHEN id=$1 THEN '2026-11-02T00:00:00Z'::timestamptz
		ELSE '2026-11-02T20:00:00Z'::timestamptz END WHERE id=ANY($2)`,
		first, []string{first, second, third})
	if len(duplicateReview(t, admin).Groups) != 1 {
		t.Fatal("same collection day should match despite recording hours apart")
	}

	ids := []string{third, first, second}
	tradeWant(t, "dismiss", admin.c.Do("POST", "/api/admin/duplicates/dismiss",
		map[string]any{"ids": ids}), 200)
	if len(duplicateReview(t, admin).Groups) != 0 {
		t.Fatal("dismissed group reappeared")
	}
	lines := auditLines(t, w.app, "duplicate_dismissals", "id",
		tradeText(t, w.app, `SELECT id FROM duplicate_dismissals`))
	if len(lines) != 1 || lines[0].Actor != admin.id {
		t.Fatalf("dismiss audit: %+v", lines)
	}

	fourth := duplicateCollection(t, w, collector,
		tradeLine(other, "2", "1"), tradeLine(w.material, "4", "5"))
	tradeExec(t, w.app, `UPDATE transactions SET collection_day='2026-11-01' WHERE id=$1`, fourth)
	if groups := duplicateReview(t, admin).Groups; len(groups) != 1 || len(groups[0].Trades) != 4 {
		t.Fatalf("new copy must resurface the group: %+v", groups)
	}

	possible := duplicateCollection(t, w, collector, tradeLine(other, "22", "1"))
	tradeExec(t, w.app, `UPDATE transactions SET collection_day='2026-11-01' WHERE id=$1`, possible)
	groups := duplicateReview(t, admin).Groups
	if len(groups) != 2 || groups[1].Kind != "possible" || len(groups[1].Trades) != 5 {
		t.Fatalf("same total with different items must be possible: %+v", groups)
	}
	duplicateMark(t, admin, possible, first, 409)

	// An incomplete selection is not a review of the current group.
	tradeWant(t, "stale dismiss", admin.c.Do("POST", "/api/admin/duplicates/dismiss",
		map[string]any{"ids": []string{first, second}}), 409)
}

func TestDuplicateMarkUndoStockAuditAndReadSurfaces(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collectorUser := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, collectorUser.phone)
	first := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	copyID := duplicateCollection(t, w, collector, tradeLine(w.material, "4.00", "5.00"))
	stockID := tradeText(t, w.app, `SELECT id FROM stock WHERE owner_id=$1`, w.buyer.id)
	before := len(auditLines(t, w.app, "stock", "id", stockID))
	itemsBefore := tradeText(t, w.app, `SELECT jsonb_agg(to_jsonb(i))::text
		FROM transaction_items i WHERE transaction_id=$1`, copyID)

	duplicateMark(t, admin, copyID, first, 200)
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "4")
	if got := tradeText(t, w.app, `SELECT status || ':' || duplicate_of FROM transactions WHERE id=$1`, copyID); got != "duplicate:"+first {
		t.Fatalf("marked state %s", got)
	}
	audit := auditLines(t, w.app, "stock", "id", stockID)
	if len(audit) != before+1 || audit[len(audit)-1].Actor != admin.id {
		t.Fatalf("mark must append an actor-named stock movement: %+v", audit)
	}
	tradeAudit := auditLines(t, w.app, "transactions", "id", copyID)
	if !slices.ContainsFunc(tradeAudit, func(line auditLine) bool {
		return line.Actor == admin.id && line.New["status"] == "duplicate"
	}) {
		t.Fatal("missing duplicate status audit")
	}

	tradeWant(t, "void invoice", w.buyer.c.Do("GET", "/api/transactions/"+copyID+"/invoice", nil), 410)
	archive := w.buyer.c.Do("GET", "/api/business/export", nil)
	tradeWant(t, "legal archive", archive, 200)
	archived := archive.Body["transactions"].([]any)
	if len(archived) != 2 || !slices.ContainsFunc(archived, func(row any) bool {
		trade := row.(map[string]any)
		return trade["id"] == copyID && trade["status"] == "duplicate" && trade["duplicate_of"] == first
	}) {
		t.Fatalf("archive must retain marked trade with status: %s", archive.Raw)
	}
	tradeWant(t, "unrelated invoice", w.seller.c.Do("GET", "/api/transactions/"+copyID+"/invoice", nil), 404)
	if err := w.app.Invoices.Generate(context.Background(), copyID, true); err != nil {
		t.Fatalf("generation should skip duplicate: %v", err)
	}
	if review := duplicateReview(t, admin); len(review.Marked) != 1 || len(review.Groups) != 0 {
		t.Fatalf("marked review: %+v", review)
	}

	for _, check := range []struct {
		count  int
		weight string
	}{{1, "4"}, {2, "8"}} {
		for _, person := range []tradeUser{admin, w.buyer} {
			res := person.c.Do("GET", "/api/transactions", nil)
			tradeWant(t, "list", res, 200)
			if len(tradeItems(res)) != check.count {
				t.Fatalf("list includes marked copy: %s", res.Raw)
			}
			totals := person.c.Do("GET", "/api/transactions/totals", nil)
			if totals.Body["count"] != float64(check.count) {
				t.Fatalf("totals: %s", totals.Raw)
			}
			duplicateNumber(t, totals.Body["weight"].(string), check.weight)
		}

		dashboard := tradeDash(t, admin, "/api/admin/dashboard")
		if dashboard["totals"].(map[string]any)["count"] != float64(check.count) {
			t.Fatalf("dashboard includes duplicate: %v", dashboard)
		}
		stats := admin.c.Do("GET", "/api/stats", nil)
		if stats.Body["deals"] != float64(check.count) {
			t.Fatalf("public stats: %s", stats.Raw)
		}
		collectorStats := admin.c.Do("GET", "/api/collectors/stats?phone="+url.QueryEscape(collectorUser.phone), nil)
		tradeWant(t, "collector stats", collectorStats, 200)
		if collectorStats.Body["totals"].(map[string]any)["transaction_count"] != float64(check.count) {
			t.Fatalf("collector stats: %s", collectorStats.Raw)
		}
		for _, path := range []string{"/api/admin/exports/transactions", "/api/exports/collections"} {
			if rows := csvRows(t, admin.c, path); len(rows) != check.count+1 {
				t.Fatalf("export includes duplicate: %v", rows)
			}
		}

		if check.count == 1 {
			filtered := admin.c.Do("GET", "/api/transactions?status=duplicate", nil)
			if rows := tradeItems(filtered); len(rows) != 1 || rows[0].(map[string]any)["id"] != copyID {
				t.Fatalf("explicit duplicate filter: %s", filtered.Raw)
			}
			tradeWant(t, "undo", admin.c.Do("POST", "/api/admin/duplicates/"+copyID+"/undo", nil), 200)
		}
	}

	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "8")
	audit = auditLines(t, w.app, "stock", "id", stockID)
	if len(audit) != before+2 || audit[len(audit)-1].Actor != admin.id {
		t.Fatalf("undo must append a second movement: %+v", audit)
	}
	if got := tradeText(t, w.app, `SELECT status || COALESCE(duplicate_of,'') ||
		COALESCE(duplicate_marked_by,'') || COALESCE(duplicate_marked_at::text,'')
		FROM transactions WHERE id=$1`, copyID); got != "complete" {
		t.Fatalf("undo metadata not cleared: %s", got)
	}
	if got := tradeText(t, w.app, `SELECT jsonb_agg(to_jsonb(i))::text
		FROM transaction_items i WHERE transaction_id=$1`, copyID); got != itemsBefore {
		t.Fatal("mark or undo changed financial lines")
	}
	tradeWant(t, "restored invoice", w.buyer.c.Do("GET", "/api/transactions/"+copyID+"/invoice", nil), 200)
}

func TestDuplicateRefusalsAndRoleAccess(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000902")
	first := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	copyID := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	for _, person := range []tradeUser{
		tradeNewUser(t, w.app, "staff"), w.buyer, w.seller,
		tradeNewUser(t, w.app, "collector"),
	} {
		tradeWant(t, "review denied", person.c.Do("GET", "/api/admin/duplicates", nil), 403)
		duplicateMark(t, person, copyID, first, 403)
		tradeWant(t, "undo denied", person.c.Do("POST", "/api/admin/duplicates/"+copyID+"/undo", nil), 403)
		tradeWant(t, "dismiss denied", person.c.Do("POST", "/api/admin/duplicates/dismiss",
			map[string]any{"ids": []string{first, copyID}}), 403)
	}

	stockID := tradeText(t, w.app, `SELECT id FROM stock WHERE owner_id=$1`, w.buyer.id)
	tradeExec(t, w.app, `UPDATE stock SET weight=3 WHERE id=$1`, stockID)
	before := len(auditLines(t, w.app, "stock", "id", stockID))
	duplicateMark(t, admin, copyID, first, 409)
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "3")
	if len(auditLines(t, w.app, "stock", "id", stockID)) != before ||
		tradeText(t, w.app, `SELECT status FROM transactions WHERE id=$1`, copyID) != "complete" {
		t.Fatal("refused mark changed stock, status or history")
	}

	sale1 := tradeSale(t, w.seller, w.buyer, w.material, "4", "8")
	sale2 := tradeSale(t, w.seller, w.buyer, w.material, "4", "8")
	duplicateMark(t, admin, sale2, sale1, 400)
	groups := duplicateReview(t, admin).Groups
	if !slices.ContainsFunc(groups, func(group adminsvc.DuplicateGroup) bool {
		return group.Kind == "exact" && group.Trades[0].Type == "b2b"
	}) {
		t.Fatal("b2b candidates must remain visible")
	}
}

func TestCollectionIdempotency(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000903")
	body := tradeCollection(collector, "", tradeLine(w.material, "4", "5"))
	post := func(person tradeUser, key string) string {
		t.Helper()
		data, _ := json.Marshal(body)
		request, err := http.NewRequest("POST", w.app.URL+"/api/transactions/collections", bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}

		request.Header.Set("Origin", testutil.WebOrigin)
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Idempotency-Key", key)
		response, err := person.c.HTTP.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()

		data, _ = io.ReadAll(response.Body)
		if response.StatusCode != 200 {
			t.Fatalf("idempotent post: %d %s", response.StatusCode, data)
		}
		var out map[string]string
		if err := json.Unmarshal(data, &out); err != nil {
			t.Fatal(err)
		}

		return out["transaction_id"]
	}

	first := post(w.buyer, "first-key")
	if post(w.buyer, "first-key") != first {
		t.Fatal("same key created a second trade")
	}
	if post(w.buyer, "second-key") == first {
		t.Fatal("two keys must create two trades")
	}
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "8")

	if post(w.seller, "first-key") == first {
		t.Fatal("another user's key returned someone else's result")
	}
	tradeExec(t, w.app, `UPDATE collection_idempotency SET expires_at=now()-interval '1 second'
		WHERE user_id=$1 AND key='first-key'`, w.buyer.id)
	if post(w.buyer, "first-key") == first {
		t.Fatal("expired key must allow a new collection")
	}
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "12")

	var pending sync.WaitGroup
	results := make(chan string, 2)
	for range 2 {
		pending.Add(1)
		go func() {
			defer pending.Done()
			results <- post(w.buyer, "concurrent-key")
		}()
	}
	pending.Wait()
	close(results)

	var concurrent []string
	for id := range results {
		concurrent = append(concurrent, id)
	}
	if len(concurrent) != 2 || concurrent[0] != concurrent[1] {
		t.Fatalf("concurrent posts must return one result: %v", concurrent)
	}
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "16")
}

func TestDuplicateMarkRollsBackAllMaterials(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000904")
	materials := []string{w.material, tradeMaterial(t, w.app, "Aluminium", "1")}
	slices.Sort(materials)
	first := duplicateCollection(t, w, collector,
		tradeLine(materials[0], "4", "5"), tradeLine(materials[1], "4", "5"))
	copyID := duplicateCollection(t, w, collector,
		tradeLine(materials[1], "4", "5"), tradeLine(materials[0], "4", "5"))
	tradeExec(t, w.app, `UPDATE stock SET weight=3 WHERE owner_id=$1 AND material_id=$2`,
		w.buyer.id, materials[1])
	before := tradeText(t, w.app, `SELECT count(*)::text FROM audit_log WHERE table_name='stock'`)

	duplicateMark(t, admin, copyID, first, 409)
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, materials[0]), "8")
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, materials[1]), "3")
	if tradeText(t, w.app, `SELECT count(*)::text FROM audit_log WHERE table_name='stock'`) != before {
		t.Fatal("failed second material left a stock audit entry from the first")
	}
	if tradeText(t, w.app, `SELECT status FROM transactions WHERE id=$1`, copyID) != "complete" {
		t.Fatal("failed multi-material mark changed the trade")
	}
}

func TestDuplicateMatchingKeepsPartiesAndDaysSeparate(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000905")
	other := tradeCollector(t, w.app, w.buyer, "+27800000906")
	first := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	second := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	duplicateCollection(t, w, other, tradeLine(w.material, "4", "5"))
	res := w.seller.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "4", "5")))
	tradeWant(t, "different buyer", res, 200)
	tradeExec(t, w.app, `UPDATE transactions SET collection_day='2026-10-01' WHERE id=$1`, second)
	if len(duplicateReview(t, admin).Groups) != 0 {
		t.Fatal("different parties or days must not match")
	}

	// A missing collection date uses the created_at calendar day in South Africa.
	tradeExec(t, w.app, `UPDATE transactions SET collection_day=NULL,collection_date=NULL,
		created_at=CASE WHEN id=$1 THEN '2026-11-01T22:30:00Z'::timestamptz
		ELSE '2026-11-02T12:30:00Z'::timestamptz END WHERE id=ANY($2)`, first, []string{first, second})
	groups := duplicateReview(t, admin).Groups
	if len(groups) != 1 || len(groups[0].Trades) != 2 || groups[0].OriginalID != first {
		t.Fatalf("fallback calendar day matching: %+v", groups)
	}

	tradeExec(t, w.app, `UPDATE transactions SET collection_date='2026-10-01T00:00:00Z'
		WHERE id=$1`, second)
	if len(duplicateReview(t, admin).Groups) != 1 {
		t.Fatal("a missing collection day must fall back to created_at, not collection_date")
	}
}
