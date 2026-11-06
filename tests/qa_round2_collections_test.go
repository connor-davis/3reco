package tests

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/3reco/tests/testutil"
)

// A collection is never dated after today in South Africa.
func TestCollectionDateNotInTheFuture(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000061")
	sast := time.FixedZone("SAST", 2*60*60)
	today := time.Now().In(sast)

	post := func(extra map[string]any) testutil.Response {
		body := tradeCollection(collector, "", tradeLine(w.material, "1", "6"))
		for key, value := range extra {
			body[key] = value
		}

		return w.buyer.c.Do("POST", "/api/transactions/collections", body)
	}

	future := post(map[string]any{"collection_day": "2030-01-01"})
	tradeWant(t, "2030", future, 400)

	if fields, _ := future.Body["fields"].(map[string]any); fields["collection_day"] == nil {
		t.Errorf("no collection_day field error: %s", future.Raw)
	}

	tradeWant(t, "tomorrow", post(map[string]any{
		"collection_day": today.AddDate(0, 0, 1).Format(time.DateOnly)}), 400)
	tradeWant(t, "today", post(map[string]any{
		"collection_day": today.Format(time.DateOnly)}), 200)
	tradeWant(t, "yesterday", post(map[string]any{
		"collection_day": today.AddDate(0, 0, -1).Format(time.DateOnly)}), 200)

	// The timestamp form follows the same rule.
	late := post(map[string]any{"collection_date": today.AddDate(0, 0, 2).UTC().Format(time.RFC3339)})
	tradeWant(t, "future timestamp", late, 400)

	if fields, _ := late.Body["fields"].(map[string]any); fields["collection_date"] == nil {
		t.Errorf("no collection_date field error: %s", late.Raw)
	}

	tradeWant(t, "past timestamp", post(map[string]any{
		"collection_date": today.AddDate(0, 0, -2).UTC().Format(time.RFC3339)}), 200)

	if n := tradeText(t, w.app, `SELECT count(*)::text FROM transactions`); n != "3" {
		t.Errorf("%s collections saved, want 3 (today, yesterday, past timestamp)", n)
	}
}

// The collector can read the invoice and the receipts of their own sale, but
// cannot add a receipt. The file keeps its name's letter case.
func TestCollectorSeesInvoiceAndReceipts(t *testing.T) {
	w := newTradeWorld(t)
	mine := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, mine.phone)
	made := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "10", "6")))
	tradeWant(t, "collection", made, 200)

	id, _ := made.Body["transaction_id"].(string)
	path := "/api/transactions/" + id

	upload := uploadImage(t, w.app, w.buyer.c, path+"/receipts", receiptImage(7))
	tradeWant(t, "buyer receipt", upload, 200)

	if name, _ := upload.Body["file_name"].(string); name != "Receipt_photo.png" {
		t.Errorf("receipt name %q, want Receipt_photo.png", name)
	}

	invoice := mine.c.Do("GET", path+"/invoice", nil)
	tradeWant(t, "collector invoice", invoice, 200)

	detail := mine.c.Do("GET", path, nil)
	tradeWant(t, "collector detail", detail, 200)

	if receipts, _ := detail.Body["receipts"].([]any); len(receipts) != 1 {
		t.Errorf("collector sees %d receipts, want 1", len(receipts))
	}

	if refused := uploadImage(t, w.app, mine.c, path+"/receipts", receiptImage(9)); refused.Status < 400 {
		t.Errorf("collector receipt upload: %d, want a refusal", refused.Status)
	}

	// The browser and the email both name the file 3REco-Invoice-<NUMBER>.pdf.
	number := strings.ToUpper(id[len(id)-8:])
	request, _ := http.NewRequest("GET", w.app.URL+path+"/invoice", nil)

	response, err := mine.c.HTTP.Do(request)
	if err != nil {
		t.Fatal(err)
	}

	_ = response.Body.Close()

	if header := response.Header.Get("Content-Disposition"); !strings.Contains(header, `filename="3REco-Invoice-`+number+`.pdf"`) {
		t.Errorf("invoice header %q", header)
	}
}
