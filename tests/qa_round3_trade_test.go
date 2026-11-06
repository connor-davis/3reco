package tests

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestRound3CollectorPayoutAccess(t *testing.T) {
	w := newTradeWorld(t)
	login := tradeNewUser(t, w.app, "collector")
	staff := tradeNewUser(t, w.app, "staff")
	admin := tradeNewUser(t, w.app, "admin")
	other := tradeNewUser(t, w.app, "business")
	collector := tradeCollector(t, w.app, w.buyer, login.phone)
	tradeExec(t, w.app, `UPDATE collectors SET created_by_business_id=$2,
		bank_account_holder_name='Frozen Holder',bank_name='Frozen Bank',bank_branch_code='250655',
		bank_account_type='Cheque',bank_account_number=$3 WHERE id=$1`,
		collector, w.buyer.id, testutil.Seal(t, "62000111222"))
	makeCollection := func(buyer tradeUser) string {
		got := status(t, buyer.c.Do("POST", "/api/transactions/collections",
			tradeCollection(collector, "", tradeLine(w.material, "1.01", "2.50"))), 200)
		return got.Body["transaction_id"].(string)
	}
	id := makeCollection(w.buyer)
	foreignID := makeCollection(other)
	for _, test := range []struct {
		name string
		user tradeUser
		full bool
	}{
		{"owner", w.buyer, true}, {"collector", login, true}, {"admin", admin, true},
		{"staff", staff, false}, {"other business participant", other, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			tradeID := id
			if test.user.id == other.id {
				tradeID = foreignID
			}
			pdf := status(t, test.user.c.Do("GET", "/api/transactions/"+tradeID+"/invoice", nil), 200)
			want := "******1222"
			if test.full {
				want = "62000111222"
			}
			if !bytes.Contains(pdf.Raw, []byte(want)) || (!test.full && bytes.Contains(pdf.Raw, []byte("62000111222"))) {
				t.Fatalf("wrong payout projection in PDF: want %s", want)
			}
			view := status(t, test.user.c.Do("GET", "/api/collectors/"+collector, nil), 200)
			if view.Body["bank_account_number"] != want {
				t.Fatalf("collector API: %s", view.Raw)
			}
			detail := status(t, test.user.c.Do("GET", "/api/transactions/"+tradeID, nil), 200)
			if _, exists := detail.Body["collector_snapshot"]; exists || bytes.Contains(detail.Raw, []byte("62000111222")) {
				t.Fatal("transaction API exposes private snapshot")
			}
			if test.name != "collector" {
				rows := csvRows(t, test.user.c, "/api/exports/collections")
				for _, row := range rows[1:] {
					if !strings.Contains(row[18], want) || (!test.full && strings.Contains(row[18], "62000111222")) {
						t.Fatalf("CSV payout: %v", row)
					}
				}
			} else {
				status(t, login.c.Do("GET", "/api/exports/collections", nil), 403)
			}
		})
	}
	status(t, other.c.Do("GET", "/api/transactions/"+id, nil), 404)
	status(t, other.c.Do("GET", "/api/transactions/"+id+"/invoice", nil), 404)
	// Attachments must use the recipient's permissions, not whoever recorded the trade.
	for _, test := range []struct {
		buyer tradeUser
		id    string
		full  bool
	}{
		{w.buyer, id, true}, {other, foreignID, false},
	} {
		number := strings.ToUpper(test.id[len(test.id)-8:])
		message := testutil.WaitMail(t, test.buyer.email, number)
		if len(message.Attachments) != 1 {
			t.Fatal("invoice attachment missing")
		}
		attachment := round3MailPDF(t, test.buyer.email, number)
		if bytes.Contains(attachment, []byte("62000111222")) != test.full {
			t.Fatal("email attachment has wrong recipient payout")
		}
		// Generate exercises the same recipient projection used by the attachment.
		if err := w.app.Invoices.Generate(context.Background(), test.id, false); err != nil {
			t.Fatal(err)
		}
		key := tradeText(t, w.app, `SELECT invoice_key FROM transactions WHERE id=$1`, test.id)
		reader, err := w.app.Storage.Get(context.Background(), key)
		if err != nil {
			t.Fatal(err)
		}
		var data bytes.Buffer
		_, err = data.ReadFrom(reader)
		_ = reader.Close()
		if err != nil {
			t.Fatal(err)
		}
		if bytes.Contains(data.Bytes(), []byte("62000111222")) != test.full {
			t.Fatal("stored/email invoice has wrong recipient payout")
		}
	}
	// A permission decision must still apply to frozen details after profile changes.
	tradeExec(t, w.app, `UPDATE collectors SET bank_account_number=NULL WHERE id=$1`, collector)
	status(t, staff.c.Do("GET", "/api/transactions/"+id+"/invoice", nil), 200)
}

func round3MailPDF(t *testing.T, to, number string) []byte {
	t.Helper()
	response, err := http.Get(testutil.MailpitURL + "/api/v1/search?query=" + url.QueryEscape("to:"+to))
	if err != nil {
		t.Fatal(err)
	}
	var list struct {
		Messages []struct{ ID, Subject string }
	}
	err = json.NewDecoder(response.Body).Decode(&list)
	_ = response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	for _, message := range list.Messages {
		if !strings.Contains(message.Subject, number) {
			continue
		}
		response, err := http.Get(testutil.MailpitURL + "/api/v1/message/" + message.ID + "/raw")
		if err != nil {
			t.Fatal(err)
		}
		parsed, err := mail.ReadMessage(response.Body)
		if err != nil {
			_ = response.Body.Close()
			t.Fatal(err)
		}
		_, params, err := mime.ParseMediaType(parsed.Header.Get("Content-Type"))
		if err != nil {
			_ = response.Body.Close()
			t.Fatal(err)
		}
		parts := multipart.NewReader(parsed.Body, params["boundary"])
		for {
			part, err := parts.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				_ = response.Body.Close()
				t.Fatal(err)
			}
			if part.Header.Get("Content-Type") != "application/pdf" {
				continue
			}
			data, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, part))
			_ = response.Body.Close()
			if err != nil {
				t.Fatal(err)
			}
			return data
		}
		_ = response.Body.Close()
	}
	t.Fatal("invoice PDF missing from email")
	return nil
}

func TestRound3CollectionStockAndWeights(t *testing.T) {
	w := newTradeWorld(t)
	collector := tradeCollector(t, w.app, w.buyer, "+27800000071")
	stock := tradeStock(t, w.app, w.buyer.id, w.material, "10.005", "19.99")
	for _, weight := range []string{"1.005", "1.000", "0.001"} {
		status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
			tradeCollection(collector, "", tradeLine(w.material, weight, "0.95"))), 400)
		status(t, w.seller.c.Do("POST", "/api/transactions/sales", map[string]any{
			"business_id": w.buyer.id, "items": []map[string]any{tradeLine(w.material, weight, "8")},
		}), 400)
		status(t, w.buyer.c.Do("PATCH", "/api/stock/"+stock, map[string]any{"weight": weight}), 400)
		status(t, w.buyer.c.Do("POST", "/api/stock", map[string]any{
			"material_id": w.material, "weight": weight, "price": "8",
		}), 400)
		status(t, w.buyer.c.Do("PUT", "/api/cart?seller_id="+w.seller.id, map[string]any{
			"items": []map[string]any{{"stock_id": w.stock, "material_id": w.material, "weight": weight}},
		}), 400)
		status(t, w.buyer.c.Do("POST", "/api/requests", map[string]any{
			"seller_id": w.seller.id, "items": []map[string]any{{"stock_id": w.stock, "weight": weight}},
		}), 400)
	}
	if count := tradeText(t, w.app, `SELECT count(*)::text FROM transactions`); count != "0" {
		t.Fatal(count)
	}
	for _, weight := range []string{"1.00", "1.01"} {
		status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
			tradeCollection(collector, "", tradeLine(w.material, weight, "0.95"))), 200)
	}
	holdDecimal(t, tradeStockWeight(t, w.app, w.buyer.id, w.material), "12.015")
	holdDecimal(t, tradeText(t, w.app, `SELECT price::text FROM stock WHERE id=$1`, stock), "19.99")
	// Omitted weight on a historic row must not force a rewrite or reject an unrelated edit.
	status(t, w.buyer.c.Do("PATCH", "/api/stock/"+stock, map[string]any{"price": "20"}), 200)
	material := tradeMaterial(t, w.app, "New material", "6.75")
	status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(material, "2", "0.50"))), 200)
	holdDecimal(t, tradeText(t, w.app, `SELECT price::text FROM stock WHERE owner_id=$1 AND material_id=$2`, w.buyer.id, material), "6.75")
	holdDecimal(t, tradeText(t, w.app, `SELECT price::text FROM transaction_items WHERE material_id=$1`, material), "0.50")
	request := tradeRequest(t, w.buyer, w.seller, w.stock)
	status(t, w.seller.c.Do("POST", "/api/requests/"+request+"/offer", map[string]any{
		"items": []map[string]any{tradeLine(w.material, "1.005", "8")},
	}), 400)
}

func TestRound3WalletPayoutAccess(t *testing.T) {
	w := newTradeWorld(t)
	login := tradeNewUser(t, w.app, "collector")
	staff := tradeNewUser(t, w.app, "staff")
	admin := tradeNewUser(t, w.app, "admin")
	other := tradeNewUser(t, w.app, "business")
	collector := tradeCollector(t, w.app, w.buyer, login.phone)
	tradeExec(t, w.app, `UPDATE collectors SET payout_method='ewallet',
		ewallet_platform_name='Frozen Wallet',ewallet_payment_id=$2 WHERE id=$1`,
		collector, testutil.Seal(t, "0821112222"))
	for _, buyer := range []tradeUser{w.buyer, other} {
		got := status(t, buyer.c.Do("POST", "/api/transactions/collections",
			tradeCollection(collector, "", tradeLine(w.material, "1", "2"))), 200)
		id := got.Body["transaction_id"].(string)
		for _, user := range []tradeUser{buyer, login, staff, admin} {
			full := user.id == w.buyer.id || user.id == login.id || user.id == admin.id
			pdf := status(t, user.c.Do("GET", "/api/transactions/"+id+"/invoice", nil), 200)
			want := "******2222"
			if full {
				want = "0821112222"
			}
			if !bytes.Contains(pdf.Raw, []byte(want)) || (!full && bytes.Contains(pdf.Raw, []byte("0821112222"))) {
				t.Fatal("wallet PDF projection is wrong")
			}
			if user.id != login.id {
				rows := csvRows(t, user.c, "/api/exports/collections")
				for _, row := range rows[1:] {
					if !strings.Contains(row[18], want) {
						t.Fatal(row)
					}
				}
			}
		}
		number := strings.ToUpper(id[len(id)-8:])
		testutil.WaitMail(t, buyer.email, number)
		attachment := round3MailPDF(t, buyer.email, number)
		if bytes.Contains(attachment, []byte("0821112222")) != (buyer.id == w.buyer.id) {
			t.Fatal("wallet email projection is wrong")
		}
	}
}

func TestRound3HistoryAndExportFilters(t *testing.T) {
	w := newTradeWorld(t)
	staff := tradeNewUser(t, w.app, "staff")
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000072")
	var ids []string
	for _, day := range []string{"2026-01-03", "2026-01-01", "2026-01-02", "2026-01-03"} {
		body := tradeCollection(collector, "", tradeLine(w.material, "1", "2"))
		body["collection_day"] = day
		got := status(t, w.buyer.c.Do("POST", "/api/transactions/collections", body), 200)
		ids = append(ids, got.Body["transaction_id"].(string))
	}
	tradeExec(t, w.app, `UPDATE transactions SET created_at='2026-01-05T10:00:00Z' WHERE id=$1`, ids[0])
	tradeExec(t, w.app, `UPDATE transactions SET created_at='2026-01-05T11:00:00Z' WHERE id=$1`, ids[3])
	first := status(t, w.buyer.c.Do("GET", "/api/transactions/purchases?type=c2b&limit=2", nil), 200)
	second := status(t, w.buyer.c.Do("GET", "/api/transactions/purchases?type=c2b&limit=2&cursor="+first.Body["next_cursor"].(string), nil), 200)
	got := append(tradeItems(first), tradeItems(second)...)
	for i, want := range []string{ids[3], ids[0], ids[2], ids[1]} {
		if got[i].(map[string]any)["id"] != want {
			t.Fatalf("history: %v", got)
		}
	}
	filtered := status(t, w.buyer.c.Do("GET", "/api/transactions/purchases?type=c2b&from=2026-01-02&to=2026-01-03", nil), 200)
	if len(tradeItems(filtered)) != 3 {
		t.Fatalf("effective date filter: %s", filtered.Raw)
	}
	tradeSale(t, w.seller, w.buyer, w.material, "1", "8")
	for _, test := range []struct {
		suffix string
		count  int
	}{{"", 5}, {"?type=c2b", 4}, {"?type=b2b", 1}} {
		rows := csvRows(t, staff.c, "/api/admin/exports/transactions"+test.suffix)
		if len(rows) != test.count+1 {
			t.Fatal(rows)
		}
	}
	rows := csvRows(t, w.buyer.c, "/api/exports/collections")
	for _, row := range rows[1:] {
		if row[18] != "" || row[11] != "+27800000072" {
			t.Fatal(row)
		}
		if _, err := time.Parse(time.DateOnly, row[2]); err != nil {
			t.Fatal(err)
		}
		if _, err := time.Parse(time.RFC3339, row[3]); err != nil {
			t.Fatal(err)
		}
	}
	users := csvRows(t, admin.c, "/api/admin/exports/users?role=staff")
	if len(users) != 2 || users[1][0] != staff.email {
		t.Fatal(users)
	}
	for _, query := range []string{"type=invalid", "role=invalid"} {
		status(t, admin.c.Do("GET", "/api/admin/exports/transactions?"+query, nil), 400)
	}
}

func TestRound3NegotiatedTradeReviewable(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	request := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, request, w.material, "20.75", "8.12")
	status(t, w.buyer.c.Do("POST", "/api/requests/"+request+"/accept", nil), 200)
	path := "/api/reviews/reviewable?seller_id=" + w.seller.id
	if items := tradeItems(status(t, w.buyer.c.Do("GET", path, nil), 200)); len(items) != 0 {
		t.Fatal("pending trade is reviewable")
	}
	done := status(t, w.seller.c.Do("POST", "/api/requests/"+request+"/accept", nil), 200)
	id := done.Body["transaction_id"].(string)
	items := tradeItems(status(t, w.buyer.c.Do("GET", path, nil), 200))
	if len(items) != 1 || items[0].(map[string]any)["transaction_id"] != id {
		t.Fatalf("completed negotiated trade missing: %v", items)
	}
	status(t, other.c.Do("POST", "/api/transactions/"+id+"/review", map[string]any{"rating": 5}), 404)
	status(t, w.buyer.c.Do("POST", "/api/transactions/"+id+"/review", map[string]any{"rating": 5}), 200)
	if items := tradeItems(status(t, w.buyer.c.Do("GET", path, nil), 200)); len(items) != 0 {
		t.Fatal("reviewed trade remains eligible")
	}
}

func TestRound3FutureCollectionPaths(t *testing.T) {
	w := newTradeWorld(t)
	staff := tradeNewUser(t, w.app, "staff")
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, "+27800000073")
	tomorrow := time.Now().In(time.FixedZone("SAST", 7200)).AddDate(0, 0, 1)
	for _, user := range []tradeUser{w.buyer, staff, admin} {
		for _, date := range []map[string]any{
			{"collection_day": tomorrow.Format(time.DateOnly)},
			{"collection_date": tomorrow.Format(time.RFC3339)},
			{"collection_day": "2026-01-01", "collection_date": tomorrow.Format(time.RFC3339)},
		} {
			body := tradeCollection(collector, w.buyer.id, tradeLine(w.material, "1", "2"))
			for key, value := range date {
				body[key] = value
			}
			status(t, user.c.Do("POST", "/api/transactions/collections", body), 400)
		}
	}
	// Collection records are immutable: there is no update endpoint to bypass validation.
	status(t, w.buyer.c.Do("PATCH", "/api/transactions/missing", map[string]any{"collection_day": tomorrow.Format(time.DateOnly)}), 404)
	if count := tradeText(t, w.app, `SELECT count(*)::text FROM transactions`); count != "0" {
		t.Fatal(count)
	}
}
