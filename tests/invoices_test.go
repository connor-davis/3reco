package tests

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/mail"
	"github.com/connor-davis/3reco/internal/platform/pdf"
	"github.com/connor-davis/3reco/internal/services/invoices"
	tstore "github.com/connor-davis/3reco/internal/stores/transactions"
	"github.com/connor-davis/3reco/tests/testutil"
)

func TestInvoiceResendAttachmentEncoding(t *testing.T) {
	var payload map[string]json.RawMessage
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		payload = nil
		if request.Header.Get("Authorization") != "Bearer local-test-key" || request.URL.Path != "/emails" {
			t.Error("wrong Resend request")
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		writer.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	mailer := mail.New(config.Config{
		ResendAPIKey: "local-test-key", ResendURL: server.URL, FromEmail: "test@example.test",
	})
	data := []byte("%PDF-1.4\nattachment content")
	err := mailer.Send(context.Background(), mail.Message{
		To: "buyer@example.test", Subject: "Your 3rEco invoice ABCD1234", Text: "Invoice attached",
		Attachments: []mail.Attachment{{
			Filename: "3rEco-Invoice-ABCD1234.pdf", ContentType: "application/pdf", Content: data,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	var attachments []struct {
		Filename    string `json:"filename"`
		Content     string `json:"content"`
		ContentType string `json:"content_type"`
	}
	if err := json.Unmarshal(payload["attachments"], &attachments); err != nil {
		t.Fatal(err)
	}
	if len(attachments) != 1 || attachments[0].Content != base64.StdEncoding.EncodeToString(data) ||
		attachments[0].Filename != "3rEco-Invoice-ABCD1234.pdf" || attachments[0].ContentType != "application/pdf" {
		t.Fatalf("Resend attachment: %+v", attachments)
	}

	if err := mailer.Send(context.Background(), mail.Message{
		To: "buyer@example.test", Subject: "No attachment", Text: "Text only",
	}); err != nil {
		t.Fatal(err)
	}
	if _, exists := payload["attachments"]; exists {
		t.Fatal("attachment-free mail includes attachment metadata")
	}
}

func TestInvoiceNumberStable(t *testing.T) {
	w := newTradeWorld(t)
	tradeExec(t, w.app, `UPDATE users SET bank_account_holder_name='Invoice Holder',bank_name='Test Bank',
		bank_account_number=$2,bank_branch_code='250655',bank_account_type='Cheque' WHERE id=$1`,
		w.seller.id, testutil.Seal(t, "123456789"))
	id := tradeSale(t, w.seller, w.buyer, w.material, "1.23", "8.12")
	number := strings.ToUpper(id[len(id)-8:])
	path := "/api/transactions/" + id + "/invoice"
	mail := testutil.WaitMail(t, w.buyer.email, "Your 3REco invoice "+number)
	if !strings.Contains(mail.Text, "3REco") || strings.Contains(mail.Text, "3rEco") {
		t.Fatalf("invoice email brand: %s", mail.Text)
	}
	if len(mail.Attachments) != 1 || mail.Attachments[0].FileName != "3REco-Invoice-"+number+".pdf" ||
		mail.Attachments[0].ContentType != "application/pdf" || mail.Attachments[0].Size == 0 {
		t.Fatalf("invoice attachments: %+v", mail.Attachments)
	}

	staff := tradeNewUser(t, w.app, "staff")
	admin := tradeNewUser(t, w.app, "admin")
	stranger := tradeNewUser(t, w.app, "business")
	for _, client := range []*testutil.Client{w.buyer.c, w.seller.c, admin.c} {
		got := client.Do("GET", path, nil)
		tradeWant(t, "invoice reader", got, 200)
		for _, text := range []string{"%PDF", number, "Invoice Holder", "123456789", "9.99", "3REco"} {
			if !bytes.Contains(got.Raw, []byte(text)) {
				t.Errorf("invoice lacks %q", text)
			}
		}
	}
	// Staff read a masked account: the full number is for the two parties and admins.
	staffPDF := status(t, staff.c.Do("GET", path, nil), 200)
	if bytes.Contains(staffPDF.Raw, []byte("123456789")) || !bytes.Contains(staffPDF.Raw, []byte("******6789")) {
		t.Error("staff invoice must show the masked account")
	}
	tradeWant(t, "invoice stranger", stranger.c.Do("GET", path, nil), 404)
	tradeWant(t, "invoice anonymous", w.app.NewClient(t).Do("GET", path, nil), 401)

	old := tradeText(t, w.app, `SELECT invoice_key FROM transactions WHERE id=$1`, id)
	newEmail := testutil.Email("no-invoice-notification")
	tradeExec(t, w.app, `UPDATE users SET email=$2 WHERE id=$1`, w.buyer.id, newEmail)
	if err := w.app.Invoices.Generate(context.Background(), id, false); err != nil {
		t.Fatal(err)
	}
	current := tradeText(t, w.app, `SELECT invoice_key FROM transactions WHERE id=$1`, id)
	if current == old {
		t.Fatal("regeneration reused object key")
	}
	if reader, err := w.app.Storage.Get(context.Background(), old); err == nil {
		_ = reader.Close()
		t.Fatal("old invoice object was not removed")
	}
	if !testutil.NoMail(t, newEmail) {
		t.Fatal("notify=false sent email")
	}

	// A stale database reference is rebuilt on download, without mail.
	if err := w.app.Storage.Remove(context.Background(), current); err != nil {
		t.Fatal(err)
	}
	tradeWant(t, "missing object rebuilt", w.buyer.c.Do("GET", path, nil), 200)
	if !testutil.NoMail(t, newEmail) {
		t.Fatal("on-demand render sent email")
	}

	old = tradeText(t, w.app, `SELECT invoice_key FROM transactions WHERE id=$1`, id)
	tradeWant(t, "remove seller", admin.c.Do("DELETE", "/api/admin/users/"+w.seller.id, nil), 200)
	deadline := time.Now().Add(5 * time.Second)
	for tradeText(t, w.app, `SELECT invoice_key FROM transactions WHERE id=$1`, id) == old {
		if time.Now().After(deadline) {
			t.Fatal("removal did not regenerate invoice")
		}
		time.Sleep(25 * time.Millisecond)
	}
	got := w.buyer.c.Do("GET", path, nil)
	if !bytes.Contains(got.Raw, []byte("Removed account")) || !testutil.NoMail(t, newEmail) {
		t.Fatal("removal did not anonymize silently")
	}
}

// Convex stored some snapshot area codes as 3610.0; the invoice must still build.
func TestInvoiceReadsFloatAreaCode(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000010")
	got := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "2", "3.25")))
	tradeWant(t, "float area code collection", got, 200)
	id := got.Body["transaction_id"].(string)
	testutil.WaitMail(t, w.buyer.email, strings.ToUpper(id[len(id)-8:]))
	tradeExec(t, w.app, `UPDATE transactions SET collector_snapshot=
		COALESCE(collector_snapshot,'{}'::jsonb) || '{"area_code":3610.0}'::jsonb WHERE id=$1`, id)

	if err := w.app.Invoices.Generate(context.Background(), id, false); err != nil {
		t.Fatalf("invoice with area code 3610.0: %v", err)
	}
}

func TestInvoiceAndExportWithoutCollectorPhone(t *testing.T) {
	w := newTradeWorld(t)
	body := collectorBody("")
	collector := status(t, w.buyer.c.Do("POST", "/api/collectors", body), 200).Body["id"].(string)
	got := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "2", "3.25")))
	tradeWant(t, "email-only collection", got, 200)
	id := got.Body["transaction_id"].(string)
	testutil.WaitMail(t, w.buyer.email, strings.ToUpper(id[len(id)-8:]))

	document, err := tstore.New(w.app.DB, testutil.Cipher(t)).Document(context.Background(), id)
	if err != nil || document.Seller.Phone != "" || document.Seller.Email != "collector@example.test" {
		t.Fatalf("email-only document: %+v, %v", document.Seller, err)
	}

	invoice := status(t, w.buyer.c.Do("GET", "/api/transactions/"+id+"/invoice", nil), 200)
	if !bytes.Contains(invoice.Raw, []byte("collector@example.test")) ||
		bytes.Contains(invoice.Raw, []byte("null")) {
		t.Fatal("email-only invoice has missing email or literal null")
	}

	rows := csvRows(t, w.buyer.c, "/api/exports/collections")
	if len(rows) != 2 || rows[1][11] != "" || rows[1][10] != "collector@example.test" {
		t.Fatalf("email-only export: %v", rows)
	}
}

func TestInvoiceSnapshotAndRollback(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000009")
	tradeExec(t, w.app, `UPDATE collectors SET payout_method='ewallet',ewallet_platform_name='Frozen Wallet',
		ewallet_payment_id=$2 WHERE id=$1`, collector, testutil.Seal(t, "snapshot-payment"))
	got := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "2", "3.25")))
	tradeWant(t, "snapshot collection", got, 200)
	id := got.Body["transaction_id"].(string)
	testutil.WaitMail(t, w.buyer.email, strings.ToUpper(id[len(id)-8:]))
	tradeExec(t, w.app, `UPDATE collectors SET ewallet_payment_id=$2 WHERE id=$1`,
		collector, testutil.Seal(t, "changed-payment"))
	if err := w.app.Invoices.Generate(context.Background(), id, false); err != nil {
		t.Fatal(err)
	}
	got = w.buyer.c.Do("GET", "/api/transactions/"+id+"/invoice", nil)
	if !bytes.Contains(got.Raw, []byte("snapshot-payment")) || bytes.Contains(got.Raw, []byte("changed-payment")) {
		t.Fatal("invoice did not preserve snapshot payout")
	}

	before := objectCount(t, w.app, "invoices/")
	old := tradeText(t, w.app, `SELECT invoice_key FROM transactions WHERE id=$1`, id)
	rolledBack := errors.New("rollback fixture")
	err := w.app.DB.InTx(context.Background(), func(ctx context.Context) error {
		w.app.Trades.QueueInvoice(ctx, id, true)
		w.app.Storage.RemoveAfterCommit(ctx, old)

		return rolledBack
	})
	if !errors.Is(err, rolledBack) || objectCount(t, w.app, "invoices/") != before {
		t.Fatal("rollback changed invoice files")
	}
	reader, err := w.app.Storage.Get(context.Background(), old)
	if err != nil {
		t.Fatal("rollback removed invoice", err)
	}
	_ = reader.Close()
}

func TestInvoicePaginationAndExactDecimals(t *testing.T) {
	document := tstore.Document{Trade: tstore.Transaction{
		ID: "fixture-long-1234abcd", InvoiceNumber: "1234ABCD", Type: "b2b",
		EffectiveAt: time.Date(2026, 11, 4, 23, 0, 0, 0, time.UTC), TotalPrice: "999999999999999999.995",
	}}
	for i := 0; i < 90; i++ {
		document.Trade.Items = append(document.Trade.Items, tstore.Item{
			MaterialName: "Long recyclable material name, wrapping across the material column",
			Weight:       "1.005", Price: "2.555",
		})
	}
	data, err := pdf.Render(invoices.Compose(document))
	if err != nil {
		t.Fatal(err)
	}
	for _, text := range []string{"%PDF", "3REco", "1234ABCD", "1 000 000 000 000 000 000.00", "1.005", "05 Nov 2026"} {
		if !bytes.Contains(data, []byte(text)) {
			t.Errorf("PDF lacks %s", text)
		}
	}
	if bytes.Count(data, []byte("/Type /Page\n")) < 3 {
		t.Fatal("long invoice did not paginate")
	}
	if pdf.Product("1.005", "2.555") != "2.57" || pdf.Decimal("1.005") != "1.01" {
		t.Fatal("decimal rounding lost precision")
	}

	if path := os.Getenv("THREERECO_TEST_INVOICE_PDF"); path != "" {
		if err := os.WriteFile(path, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
}
