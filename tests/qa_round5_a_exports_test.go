package tests

import (
	"io"
	"net/url"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestQARound5AExportSearchAndAudit(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	id := tradeSale(t, w.seller, w.buyer, w.material, "1", "8")
	collector := tradeCollector(t, w.app, w.buyer, "+27800001002")
	c2b := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "1", "2"))), 200).Body["transaction_id"].(string)
	tradeExec(t, w.app, `UPDATE users SET business_name='Greenline',first_name='Alice',last_name='Recycler' WHERE id=$1`, w.seller.id)
	for _, test := range []struct {
		client            *testutil.Client
		actor, kind, path string
	}{
		{admin.c, admin.id, "transactions", "/api/admin/exports/transactions"},
		{admin.c, admin.id, "users", "/api/admin/exports/users"},
		{w.buyer.c, w.buyer.id, "collections", "/api/exports/collections"},
		{w.buyer.c, w.buyer.id, "purchases", "/api/exports/purchases"},
		{w.seller.c, w.seller.id, "sales", "/api/exports/sales"},
	} {
		before := tradeText(t, w.app, `SELECT count(*)::text FROM privacy_events WHERE kind='export'`)
		csvRows(t, test.client, test.path+"?q=NoMatch&type=c2b&itemised=true")
		after := tradeText(t, w.app, `SELECT count(*)::text FROM privacy_events WHERE kind='export'`)
		if before == after {
			t.Fatal("empty download was not recorded")
		}
		got := status(t, admin.c.Do("GET", "/api/admin/privacy-events", nil), 200)
		event := pageItems(t, got)[0]
		details := event["details"].(map[string]any)
		filters := details["filters"].(map[string]any)
		if event["actor_id"] != test.actor || event["kind"] != "export" || details["export_kind"] != test.kind ||
			filters["q"] != "NoMatch" || filters["type"] != "c2b" || filters["itemised"] != "true" {
			t.Fatalf("export audit: %+v", event)
		}
	}
	for _, search := range []string{"Greenline", "Alice Recycler", w.seller.email} {
		rows := csvRows(t, admin.c, "/api/admin/exports/users?q="+url.QueryEscape(search))
		screen := status(t, admin.c.Do("GET", "/api/admin/users?q="+url.QueryEscape(search), nil), 200)
		if len(rows) != len(pageItems(t, screen))+1 || len(rows) != 2 || rows[1][0] != w.seller.email {
			t.Fatalf("screen/export search differs for %s: %v / %s", search, rows, screen.Raw)
		}
	}
	for _, itemised := range []string{"false", "true"} {
		rows := csvRows(t, admin.c, "/api/admin/exports/transactions?q=Greenline&type=b2b&itemised="+itemised)
		if len(rows) != 2 || rows[1][0] != id {
			t.Fatalf("transaction search: %v", rows)
		}
		rows = csvRows(t, admin.c, "/api/admin/exports/transactions?q=Greenline&type=c2b&itemised="+itemised)
		if len(rows) != 1 {
			t.Fatalf("search/type intersection: %v", rows)
		}
	}
	rows := csvRows(t, w.buyer.c, "/api/exports/collections?q="+c2b)
	if len(rows) != 2 || rows[0][len(rows[0])-1] != "Invoice number" ||
		rows[1][len(rows[1])-1] != strings.ToUpper(c2b[len(c2b)-8:]) {
		t.Fatalf("collection invoice reference: %v", rows)
	}
	rows = csvRows(t, admin.c, "/api/admin/exports/transactions?q="+id+"&from=2000-01-01T00:00:00Z&to=2000-01-02T00:00:00Z")
	if len(rows) != 1 {
		t.Fatalf("search/date intersection: %v", rows)
	}
	before := tradeText(t, w.app, `SELECT count(*)::text FROM privacy_events WHERE kind='export'`)
	status(t, w.buyer.c.Do("GET", "/api/admin/exports/users", nil), 403)
	status(t, admin.c.Do("GET", "/api/admin/exports/transactions?from=wrong", nil), 400)
	if before != tradeText(t, w.app, `SELECT count(*)::text FROM privacy_events WHERE kind='export'`) {
		t.Fatal("failed request was recorded as a download")
	}
}

func TestQARound5AExportFilenameAndDates(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeSale(t, w.seller, w.buyer, w.material, "1", "8")
	tradeExec(t, w.app, `UPDATE transactions SET created_at='2026-11-04T23:30:00Z' WHERE id=$1`, id)
	path := "/api/exports/sales?type=b2b&itemised=true&from=2026-11-04T22:00:00Z&to=2026-11-05T21:59:59Z"
	got, err := w.seller.c.HTTP.Get(w.app.URL + path)
	if err != nil {
		t.Fatal(err)
	}
	defer got.Body.Close()
	if _, err := io.Copy(io.Discard, got.Body); err != nil {
		t.Fatal(err)
	}
	if got.Header.Get("Content-Disposition") != `attachment; filename="3REco-sales-b2b-by-material-2026-11-05-2026-11-05.csv"` {
		t.Fatalf("filename: %v", got.Header)
	}
	rows := csvRows(t, w.seller.c, path)
	if len(rows) != 2 || rows[1][2] != "2026-11-05" || rows[1][3] != "2026-11-05 01:30:00" {
		t.Fatalf("SAST dates and times: %v", rows)
	}
}

func TestQARound5ARemovedPrivacyAccount(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	status(t, w.seller.c.Do("GET", "/api/privacy/export", nil), 200)
	status(t, admin.c.Do("DELETE", "/api/admin/users/"+admin.id, nil), 403)
	status(t, admin.c.Do("DELETE", "/api/admin/users/"+w.seller.id, nil), 200)
	got := status(t, admin.c.Do("GET", "/api/admin/privacy-events", nil), 200)
	found := false
	for _, event := range pageItems(t, got) {
		if event["subject_id"] == w.seller.id {
			found = true
			if event["subject_name"] != "Removed account" || event["subject_role"] != nil {
				t.Fatalf("removed subject projected as a guest: %+v", event)
			}
		}
		if event["actor_id"] == w.seller.id && (event["actor_name"] != "Removed account" || event["actor_role"] != nil) {
			t.Fatalf("removed actor projected as a guest: %+v", event)
		}
	}
	if !found {
		t.Fatal("removed account lost its privacy history")
	}
}
