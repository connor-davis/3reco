package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"slices"
	"strings"
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

// duplicateOn sets the collection date the app shows for a collection.
func duplicateOn(t *testing.T, w tradeWorld, date string, ids ...string) {
	t.Helper()

	tradeExec(t, w.app, `UPDATE transactions SET collection_day=NULL, collection_date=$1::timestamptz
		WHERE id=ANY($2)`, date, ids)
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

func duplicateDelete(t *testing.T, admin tradeUser, id, original string, want int) {
	t.Helper()

	res := admin.c.Do("POST", "/api/admin/duplicates/"+id+"/delete",
		map[string]any{"original_id": original})
	tradeWant(t, "delete copy", res, want)
}

func duplicateNumber(t *testing.T, got, want string) {
	t.Helper()

	value, ok := new(big.Rat).SetString(got)
	expected, _ := new(big.Rat).SetString(want)
	if !ok || value.Cmp(expected) != 0 {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func duplicateTradeOf(group adminsvc.DuplicateGroup, id string) adminsvc.DuplicateTrade {
	for _, trade := range group.Trades {
		if trade.ID == id {
			return trade
		}
	}

	return adminsvc.DuplicateTrade{}
}

func duplicateIDs(group adminsvc.DuplicateGroup) []string {
	ids := []string{}
	for _, trade := range group.Trades {
		ids = append(ids, trade.ID)
	}

	slices.Sort(ids)

	return ids
}

func TestDuplicateGroupOwnerCase(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000901")
	m2, m3 := tradeMaterial(t, w.app, "Paper", "1"), tradeMaterial(t, w.app, "Tin", "1")
	m4, m5 := tradeMaterial(t, w.app, "Steel", "1"), tradeMaterial(t, w.app, "Copper", "1")

	// Four lines on 28 Nov, a one-line copy of one of them, and a three-line
	// trade from 28 Oct that shares a line.
	big4 := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"),
		tradeLine(m2, "2", "1"), tradeLine(m3, "1", "1"), tradeLine(m4, "3", "2"))
	one := duplicateCollection(t, w, collector, tradeLine(m2, "2.00", "1.00"))
	older := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"),
		tradeLine(m5, "9", "9"), tradeLine(m4, "8", "8"))
	duplicateOn(t, w, "2026-11-28T08:00:00Z", big4, one)
	duplicateOn(t, w, "2026-10-28T08:00:00Z", older)

	groups := duplicateReview(t, admin).Groups
	if len(groups) != 1 || len(groups[0].Trades) != 3 || groups[0].OriginalID != big4 {
		t.Fatalf("one group of three, the 4-line trade suggested: %+v", groups)
	}

	if groups[0].Trades[0].ID != older {
		t.Fatalf("oldest collection date first: %+v", groups[0].Trades)
	}

	if got := duplicateTradeOf(groups[0], one).ContainedIn; got != big4 {
		t.Fatalf("the 1-line trade is a copy of the 4-line one, got %q", got)
	}

	if duplicateTradeOf(groups[0], older).ContainedIn != "" || duplicateTradeOf(groups[0], big4).ContainedIn != "" {
		t.Fatal("trades with lines of their own must not be markable")
	}

	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, m2), "4")
	duplicateDelete(t, admin, one, big4, 200)
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, m2), "2")
}

func TestDuplicateGroupsLinkAtAnyDate(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000902")
	other := tradeMaterial(t, w.app, "Paper", "1")

	// Exact copies on different dates, and a third copy: one group.
	first := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"), tradeLine(other, "2", "1"))
	second := duplicateCollection(t, w, collector, tradeLine(other, "2.00", "1.00"), tradeLine(w.material, "4.00", "5.00"))
	third := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"), tradeLine(other, "2", "1"))
	duplicateOn(t, w, "2026-09-01T08:00:00Z", first)
	duplicateOn(t, w, "2026-10-02T08:00:00Z", second)
	duplicateOn(t, w, "2026-11-03T08:00:00Z", third)

	groups := duplicateReview(t, admin).Groups
	if len(groups) != 1 || len(groups[0].Trades) != 3 || groups[0].OriginalID != first {
		t.Fatalf("three copies on three dates are one group, oldest recorded suggested: %+v", groups)
	}

	for _, trade := range groups[0].Trades {
		if !trade.ExactCopy || trade.ContainedIn == "" {
			t.Fatalf("every copy is exact and markable: %+v", trade)
		}

		if !slices.Equal(trade.SharedLines, []bool{true, true}) {
			t.Fatalf("shared lines: %+v", trade.SharedLines)
		}
	}

	if groups[0].Trades[0].ID != first || groups[0].Trades[2].ID != third {
		t.Fatal("trades must be ordered by collection date")
	}

	duplicateDelete(t, admin, third, first, 200)
	if got := duplicateReview(t, admin).Groups; len(got) != 1 || len(got[0].Trades) != 2 {
		t.Fatalf("two trades left in the group: %+v", got)
	}
}

func TestDuplicateNothingLinksWithoutASharedLineAndParty(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000903")
	otherCollector := tradeCollector(t, w.app, w.buyer, "+27800000904")
	paper := tradeMaterial(t, w.app, "Paper", "1")

	// The same total (20) but no identical line.
	duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	duplicateCollection(t, w, collector, tradeLine(paper, "4", "5"))
	duplicateCollection(t, w, collector, tradeLine(w.material, "2", "10"))
	// The same line from another collector, and for another buyer.
	duplicateCollection(t, w, otherCollector, tradeLine(w.material, "4", "5"))
	res := w.seller.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "4", "5")))
	tradeWant(t, "other buyer", res, 200)

	if groups := duplicateReview(t, admin).Groups; len(groups) != 0 {
		t.Fatalf("nothing links without a shared line, seller and buyer: %+v", groups)
	}
}

func TestDuplicatePartialOverlapIsGroupedButNotDeletable(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000905")
	paper := tradeMaterial(t, w.app, "Paper", "1")
	first := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	extra := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"), tradeLine(paper, "1", "1"))

	groups := duplicateReview(t, admin).Groups
	if len(groups) != 1 || groups[0].OriginalID != extra {
		t.Fatalf("grouped, the trade with more lines suggested: %+v", groups)
	}

	if duplicateTradeOf(groups[0], extra).ContainedIn != "" || duplicateTradeOf(groups[0], first).ContainedIn != extra {
		t.Fatalf("only the smaller trade is contained: %+v", groups[0])
	}

	duplicateDelete(t, admin, extra, first, 409)
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, paper), "1")
}

func TestDuplicateDismissalResurfacesWhenATradeJoins(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000906")
	first := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	second := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))

	tradeWant(t, "stale dismiss", admin.c.Do("POST", "/api/admin/duplicates/dismiss",
		map[string]any{"ids": []string{first}}), 400)
	tradeWant(t, "dismiss", admin.c.Do("POST", "/api/admin/duplicates/dismiss",
		map[string]any{"ids": []string{second, first}}), 200)
	if len(duplicateReview(t, admin).Groups) != 0 {
		t.Fatal("dismissed group reappeared")
	}

	lines := auditLines(t, w.app, "duplicate_dismissals", "id",
		tradeText(t, w.app, `SELECT id FROM duplicate_dismissals`))
	if len(lines) != 1 || lines[0].Actor != admin.id {
		t.Fatalf("dismiss audit: %+v", lines)
	}

	third := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	groups := duplicateReview(t, admin).Groups
	if len(groups) != 1 || !slices.Equal(duplicateIDs(groups[0]), sorted(first, second, third)) {
		t.Fatalf("a new trade must resurface the group: %+v", groups)
	}

	tradeWant(t, "incomplete group", admin.c.Do("POST", "/api/admin/duplicates/dismiss",
		map[string]any{"ids": []string{first, second}}), 409)
}

func sorted(ids ...string) []string {
	slices.Sort(ids)

	return ids
}

func TestDeleteDuplicateRemovesTheCopyForGood(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000907")
	first := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	copyID := duplicateCollection(t, w, collector, tradeLine(w.material, "4.00", "5.00"))
	untouched := duplicateCollection(t, w, collector, tradeLine(w.material, "9", "9"))
	stockID := tradeText(t, w.app, `SELECT id FROM stock WHERE owner_id=$1`, w.buyer.id)
	before := len(auditLines(t, w.app, "stock", "id", stockID))
	path := "/api/transactions/" + copyID + "/receipts"
	tradeWant(t, "receipt", uploadImage(t, w.app, w.buyer.c, path, receiptImage(1)), 200)
	tradeWant(t, "original receipt", uploadImage(t, w.app, w.buyer.c,
		"/api/transactions/"+first+"/receipts", receiptImage(2)), 200)
	if objectCount(t, w.app, "receipts/") != 2 {
		t.Fatal("expected two stored receipts")
	}

	duplicateDelete(t, admin, copyID, first, 200)

	if tradeText(t, w.app, `SELECT count(*)::text FROM transactions WHERE id=$1`, copyID) != "0" ||
		tradeText(t, w.app, `SELECT count(*)::text FROM transaction_items WHERE transaction_id=$1`, copyID) != "0" ||
		tradeText(t, w.app, `SELECT count(*)::text FROM transaction_receipts WHERE transaction_id=$1`, copyID) != "0" {
		t.Fatal("the copy, its lines or its receipts are still stored")
	}

	if objectCount(t, w.app, "receipts/") != 1 {
		t.Fatal("the copy's receipt file must go, the original's must stay")
	}

	if tradeText(t, w.app, `SELECT count(*)::text FROM transaction_items WHERE transaction_id=ANY($1)`,
		[]string{first, untouched}) != "2" {
		t.Fatal("other trades lost lines")
	}

	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "13")
	audit := auditLines(t, w.app, "stock", "id", stockID)
	if len(audit) != before+1 || audit[len(audit)-1].Actor != admin.id {
		t.Fatalf("delete must append an actor-named stock movement: %+v", audit)
	}

	snapshot := auditLines(t, w.app, "duplicate_copy_deleted", "id", copyID)
	if len(snapshot) != 1 || snapshot[0].Actor != admin.id || snapshot[0].Old["original_id"] != first {
		t.Fatalf("audit snapshot: %+v", snapshot)
	}

	if keys, _ := snapshot[0].Old["file_keys"].([]any); len(keys) != 2 {
		t.Fatalf("snapshot must hold the receipt and invoice file keys: %+v", snapshot[0].Old)
	}

	if objectCount(t, w.app, "receipts/"+copyID) != 0 || objectCount(t, w.app, "invoices/"+copyID) != 0 {
		t.Fatal("the copy's receipt and invoice files must be removed after the commit")
	}

	if objectCount(t, w.app, "invoices/"+first) != 1 {
		t.Fatal("the original's invoice file must stay")
	}

	if items, _ := snapshot[0].Old["items"].([]any); len(items) != 1 {
		t.Fatalf("snapshot must hold the lines: %+v", snapshot[0].Old)
	}

	rows := auditLines(t, w.app, "transactions", "id", copyID)
	if last := rows[len(rows)-1]; last.Action != "delete" || last.Actor != admin.id {
		t.Fatalf("row delete audit: %+v", rows)
	}

	if lines := auditLines(t, w.app, "transaction_items", "transaction_id", copyID); lines[len(lines)-1].Action != "delete" {
		t.Fatalf("line delete audit: %+v", lines)
	}

	tradeWant(t, "invoice gone", w.buyer.c.Do("GET", "/api/transactions/"+copyID+"/invoice", nil), 404)
	tradeWant(t, "trade gone", w.buyer.c.Do("GET", "/api/transactions/"+copyID, nil), 404)
	for _, person := range []tradeUser{admin, w.buyer} {
		totals := person.c.Do("GET", "/api/transactions/totals", nil)
		if totals.Body["count"] != float64(2) {
			t.Fatalf("totals still count the copy: %s", totals.Raw)
		}
	}

	for _, path := range []string{"/api/admin/exports/transactions", "/api/exports/collections"} {
		if rows := csvRows(t, admin.c, path); len(rows) != 3 {
			t.Fatalf("export still holds the copy: %v", rows)
		}
	}

	if dashboard := tradeDash(t, admin, "/api/admin/dashboard"); dashboard["totals"].(map[string]any)["count"] != float64(2) {
		t.Fatalf("dashboard still counts the copy: %v", dashboard)
	}

	tradeWant(t, "no undo", admin.c.Do("POST", "/api/admin/duplicates/"+copyID+"/undo", nil), 404)
}

func TestDeleteDuplicateRefusals(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000908")
	first := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	copyID := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))
	tradeWant(t, "receipt", uploadImage(t, w.app, w.buyer.c,
		"/api/transactions/"+copyID+"/receipts", receiptImage(1)), 200)

	for _, person := range []tradeUser{
		tradeNewUser(t, w.app, "staff"), w.buyer, w.seller, tradeNewUser(t, w.app, "collector"),
	} {
		tradeWant(t, "review denied", person.c.Do("GET", "/api/admin/duplicates", nil), 403)
		duplicateDelete(t, person, copyID, first, 403)
		tradeWant(t, "dismiss denied", person.c.Do("POST", "/api/admin/duplicates/dismiss",
			map[string]any{"ids": []string{first, copyID}}), 403)
	}

	// A review someone else left blocks the delete.
	tradeExec(t, w.app, `INSERT INTO store_reviews(id,seller_id,buyer_id,transaction_id,rating)
		VALUES('review-1',$1,$2,$3,5)`, w.seller.id, w.buyer.id, copyID)
	duplicateDelete(t, admin, copyID, first, 409)
	tradeExec(t, w.app, `DELETE FROM store_reviews WHERE id='review-1'`)

	// Used stock: refused, and nothing changes, files included.
	stockID := tradeText(t, w.app, `SELECT id FROM stock WHERE owner_id=$1`, w.buyer.id)
	tradeExec(t, w.app, `UPDATE stock SET weight=3 WHERE id=$1`, stockID)
	before := len(auditLines(t, w.app, "stock", "id", stockID))
	duplicateDelete(t, admin, copyID, first, 409)
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "3")
	if len(auditLines(t, w.app, "stock", "id", stockID)) != before ||
		tradeText(t, w.app, `SELECT count(*)::text FROM transactions WHERE id=$1`, copyID) != "1" ||
		objectCount(t, w.app, "receipts/") != 1 {
		t.Fatal("a refused delete changed stock, the trade or its files")
	}

	duplicateDelete(t, admin, copyID, copyID, 400)
	duplicateDelete(t, admin, copyID, "missing", 404)

	sale1 := tradeSale(t, w.seller, w.buyer, w.material, "4", "8")
	sale2 := tradeSale(t, w.seller, w.buyer, w.material, "4", "8")
	duplicateDelete(t, admin, sale2, sale1, 400)
	groups := duplicateReview(t, admin).Groups
	if !slices.ContainsFunc(groups, func(group adminsvc.DuplicateGroup) bool {
		return group.Trades[0].Type == "b2b"
	}) {
		t.Fatal("b2b candidates must remain visible")
	}
}

func TestDeleteDuplicateRollsBackAllMaterials(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000909")
	materials := []string{w.material, tradeMaterial(t, w.app, "Aluminium", "1")}
	slices.Sort(materials)
	first := duplicateCollection(t, w, collector,
		tradeLine(materials[0], "4", "5"), tradeLine(materials[1], "4", "5"))
	copyID := duplicateCollection(t, w, collector,
		tradeLine(materials[1], "4", "5"), tradeLine(materials[0], "4", "5"))
	tradeExec(t, w.app, `UPDATE stock SET weight=3 WHERE owner_id=$1 AND material_id=$2`,
		w.buyer.id, materials[1])
	before := tradeText(t, w.app, `SELECT count(*)::text FROM audit_log WHERE table_name='stock'`)

	duplicateDelete(t, admin, copyID, first, 409)
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, materials[0]), "8")
	duplicateNumber(t, tradeStockWeight(t, w.app, w.buyer.id, materials[1]), "3")
	if tradeText(t, w.app, `SELECT count(*)::text FROM audit_log WHERE table_name='stock'`) != before {
		t.Fatal("failed second material left a stock audit entry from the first")
	}

	if tradeText(t, w.app, `SELECT count(*)::text FROM transactions WHERE id=$1`, copyID) != "1" {
		t.Fatal("failed multi-material delete removed the trade")
	}
}

func TestPlainTradeDeleteStaysBlocked(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000910")
	id := duplicateCollection(t, w, collector, tradeLine(w.material, "4", "5"))

	for _, sql := range []string{
		`DELETE FROM transaction_items WHERE transaction_id=$1`,
		`DELETE FROM transactions WHERE id=$1`,
	} {
		if _, err := w.app.DB.Pool.Exec(context.Background(), sql, id); err == nil ||
			!strings.Contains(err.Error(), "never deleted") {
			t.Fatalf("%s must stay blocked, got %v", sql, err)
		}
	}
}

// duplicatePost posts a collection with an optional key and returns status and body.
func duplicatePost(
	t *testing.T, person tradeUser, w tradeWorld, key string, body map[string]any,
) (int, map[string]any) {
	t.Helper()

	data, _ := json.Marshal(body)
	request, err := http.NewRequest("POST", w.app.URL+"/api/transactions/collections", bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}

	request.Header.Set("Origin", testutil.WebOrigin)
	request.Header.Set("Content-Type", "application/json")
	if key != "" {
		request.Header.Set("Idempotency-Key", key)
	}

	response, err := person.c.HTTP.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()

	raw, _ := io.ReadAll(response.Body)
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)

	return response.StatusCode, out
}

func TestCollectionWarnsBeforeSavingALikelyCopy(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000911")
	paper := tradeMaterial(t, w.app, "Paper", "1")
	post := func(person tradeUser, key string, confirm bool, lines ...map[string]any) (int, map[string]any) {
		body := map[string]any{"collector_id": collector, "items": lines}
		if confirm {
			body["confirm_duplicate"] = true
		}

		return duplicatePost(t, person, w, key, body)
	}
	count := func() string {
		return tradeText(t, w.app, `SELECT count(*)::text FROM transactions WHERE type='c2b'`)
	}

	status, saved := post(w.buyer, "", false, tradeLine(w.material, "4", "5"), tradeLine(paper, "2", "1"))
	if status != 200 {
		t.Fatalf("no earlier trade, no warning: %d %v", status, saved)
	}

	first := saved["transaction_id"].(string)

	// An exact copy.
	status, warned := post(w.buyer, "", false, tradeLine(paper, "2.00", "1.00"), tradeLine(w.material, "4.00", "5.00"))
	matches, _ := warned["details"].([]any)
	if status != 409 || warned["code"] != "possible_duplicate" || len(matches) != 1 {
		t.Fatalf("exact copy must warn: %d %v", status, warned)
	}

	match := matches[0].(map[string]any)
	if match["id"] != first || match["exact_copy"] != true || match["invoice_number"] == "" ||
		len(match["matching_lines"].([]any)) != 2 {
		t.Fatalf("match details: %v", match)
	}

	// One shared line.
	status, warned = post(w.buyer, "", false, tradeLine(w.material, "4", "5"), tradeLine(paper, "7", "1"))
	matches, _ = warned["details"].([]any)
	if status != 409 || len(matches) != 1 || matches[0].(map[string]any)["exact_copy"] != false {
		t.Fatalf("one shared line must warn: %d %v", status, warned)
	}

	if flags := matches[0].(map[string]any)["new_lines_matched"].([]any); flags[0] != true || flags[1] != false {
		t.Fatalf("which new lines matched: %v", flags)
	}

	if count() != "1" {
		t.Fatal("a warning must not create a trade")
	}

	// Confirmed saves.
	if status, _ := post(w.buyer, "", true, tradeLine(w.material, "4", "5"), tradeLine(paper, "7", "1")); status != 200 {
		t.Fatalf("confirmed save: %d", status)
	}

	// No shared line saves without a warning.
	if status, body := post(w.buyer, "", false, tradeLine(w.material, "3", "5")); status != 200 {
		t.Fatalf("no shared line: %d %v", status, body)
	}

	// Another business posting the same lines never sees this business's trades.
	if status, body := post(w.seller, "", false, tradeLine(w.material, "4", "5"), tradeLine(paper, "2", "1")); status != 200 {
		t.Fatalf("another business must not see a match: %d %v", status, body)
	}
}

func TestCollectionWarningAndIdempotencyKey(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000912")
	body := func(confirm bool) map[string]any {
		out := map[string]any{
			"collector_id": collector, "items": []map[string]any{tradeLine(w.material, "4", "5")},
		}
		if confirm {
			out["confirm_duplicate"] = true
		}

		return out
	}
	count := func() string {
		return tradeText(t, w.app, `SELECT count(*)::text FROM transactions WHERE type='c2b'`)
	}

	status, saved := duplicatePost(t, w.buyer, w, "key-one", body(false))
	if status != 200 {
		t.Fatalf("first save: %d %v", status, saved)
	}

	// A retry of a key that already made a trade returns it, with no warning.
	status, again := duplicatePost(t, w.buyer, w, "key-one", body(false))
	if status != 200 || again["transaction_id"] != saved["transaction_id"] {
		t.Fatalf("retry must return the same trade: %d %v", status, again)
	}

	// The warning must not reserve its key: the confirmed re-post works.
	if status, _ := duplicatePost(t, w.buyer, w, "key-two", body(false)); status != 409 {
		t.Fatalf("matching lines on a new key must warn, got %d", status)
	}

	status, confirmed := duplicatePost(t, w.buyer, w, "key-two", body(true))
	if status != 200 || confirmed["transaction_id"] == saved["transaction_id"] || count() != "2" {
		t.Fatalf("confirmed re-post with the same key: %d %v", status, confirmed)
	}

	var pending sync.WaitGroup
	for range 2 {
		pending.Add(1)
		go func() {
			defer pending.Done()
			duplicatePost(t, w.buyer, w, "key-two", body(true))
		}()
	}
	pending.Wait()

	if count() != "2" {
		t.Fatal("retries of a saved key created more trades")
	}
}

func TestCollectionIdempotency(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000913")
	body := tradeCollection(collector, "", tradeLine(w.material, "4", "5"))
	post := func(person tradeUser, key string) string {
		t.Helper()

		status, out := duplicatePost(t, person, w, key, body)
		if status != 200 {
			t.Fatalf("idempotent post: %d %v", status, out)
		}

		return out["transaction_id"].(string)
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
