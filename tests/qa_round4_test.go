package tests

import (
	"bytes"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/fasthttp/websocket"

	"github.com/connor-davis/3reco/tests/testutil"
)

// closeReason reads until the server closes the socket and returns its reason.
func closeReason(t *testing.T, s *socket) string {
	t.Helper()

	for range 5 {
		_ = s.conn.SetReadDeadline(time.Now().Add(5 * time.Second))

		var ev map[string]any

		err := s.conn.ReadJSON(&ev)
		if err == nil {
			continue
		}

		var closed *websocket.CloseError
		if errors.As(err, &closed) {
			return closed.Text
		}

		t.Fatalf("read: %v", err)
	}

	t.Fatal("socket was not closed")

	return ""
}

// H1: a business invoice shows the seller's bank account in full to the seller,
// the buyer on that trade and admins, and masked to staff (D1).
func TestRound4BusinessInvoiceBankDetails(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	other := tradeNewUser(t, w.app, "business")
	tradeExec(t, w.app, `UPDATE users SET bank_account_holder_name='Metro Holder',bank_name='Metro Bank',
		bank_branch_code='250655',bank_account_type='Cheque',bank_account_number=$2 WHERE id=$1`,
		w.seller.id, testutil.Seal(t, "62000111222"))

	id := tradeSale(t, w.seller, w.buyer, w.material, "2", "8")
	// The stored invoice is the buyer's; staff must still get a masked one.
	testutil.WaitMail(t, w.buyer.email, strings.ToUpper(id[len(id)-8:]))

	for _, test := range []struct {
		name string
		user tradeUser
		full bool
	}{
		{"seller", w.seller, true}, {"buyer", w.buyer, true}, {"admin", admin, true},
		{"staff", staff, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			pdf := status(t, test.user.c.Do("GET", "/api/transactions/"+id+"/invoice", nil), 200)
			full := bytes.Contains(pdf.Raw, []byte("62000111222"))
			branch := bytes.Contains(pdf.Raw, []byte("250655"))
			masked := bytes.Contains(pdf.Raw, []byte("******1222"))
			if full != test.full || branch != test.full || masked == test.full {
				t.Fatalf("bank details: full=%v branch=%v masked=%v, want full=%v", full, branch, masked, test.full)
			}

			detail := status(t, test.user.c.Do("GET", "/api/transactions/"+id, nil), 200)
			if bytes.Contains(detail.Raw, []byte("62000111222")) {
				t.Fatal("transaction JSON exposes the bank account")
			}
		})
	}

	// The email goes to the buyer, who may see the full account.
	attachment := round3MailPDF(t, w.buyer.email, strings.ToUpper(id[len(id)-8:]))
	if !bytes.Contains(attachment, []byte("62000111222")) {
		t.Fatal("buyer email attachment lost the account number")
	}

	// Someone who is not on the trade cannot read it at all.
	status(t, other.c.Do("GET", "/api/transactions/"+id+"/invoice", nil), 404)

	// The admin CSV never carries the account for staff.
	csv := status(t, staff.c.Do("GET", "/api/admin/exports/transactions", nil), 200)
	if bytes.Contains(csv.Raw, []byte("62000111222")) {
		t.Fatal("staff CSV exposes the bank account")
	}

	// H4: the admin read names the seller; the staff read leaves no line.
	if !slices.Contains(privacyKinds(t, admin, w.seller.id), "admin_full_view") {
		t.Fatalf("admin invoice view has no subject: %v", privacyKinds(t, admin, ""))
	}
	before := len(privacyKinds(t, admin, w.seller.id))
	status(t, staff.c.Do("GET", "/api/transactions/"+id+"/invoice", nil), 200)
	if len(privacyKinds(t, admin, w.seller.id)) != before {
		t.Fatal("a staff read must not be logged as an admin full view")
	}
}

// H2 / D2: the users export blanks business fields on rows that are not businesses.
func TestRound4UsersExportBlanksBusinessFieldsForStaff(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	tradeExec(t, w.app, `UPDATE users SET business_name='Temp',business_registration_number='2020/467665/07'
		WHERE id = ANY($1)`, []string{staff.id, w.seller.id})

	var staffRow, businessRow []string
	for _, row := range csvRows(t, admin.c, "/api/admin/exports/users")[1:] {
		switch row[0] {
		case staff.email:
			staffRow = row
		case w.seller.email:
			businessRow = row
		}
	}

	if staffRow == nil || businessRow == nil {
		t.Fatal("rows missing from the users export")
	}
	if staffRow[4] != "" || staffRow[5] != "" {
		t.Fatalf("staff row leaks business data: %v", staffRow)
	}
	if businessRow[4] != "Temp" || businessRow[5] != "2020/467665/07" {
		t.Fatalf("business row lost its data: %v", businessRow)
	}

	status(t, staff.c.Do("GET", "/api/admin/exports/users", nil), 403)
}

// H5: an erased account's socket says why; a plain sign-out keeps its reason.
func TestRound4RemovedSocketReason(t *testing.T) {
	w := newTradeWorld(t)
	removed := joinLive(t, w.app, w.seller)[0]
	signedOut := joinLive(t, w.app, w.buyer)[0]

	w.app.Hub.DisconnectUser(w.seller.id)
	tradeExec(t, w.app, `DELETE FROM sessions WHERE user_id = $1`, w.buyer.id)
	w.app.Hub.Recheck(t.Context())

	if reason := closeReason(t, removed); reason != "account-removed" {
		t.Fatalf("removed reason = %q, want account-removed", reason)
	}
	if reason := closeReason(t, signedOut); reason != "session-ended" {
		t.Fatalf("sign-out reason = %q, want session-ended", reason)
	}
}

// S1, S2: a counter price must be above zero with at most 2 decimals; a bad one
// changes nothing and tells nobody.
func TestRound4CounterOfferPriceRules(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	count := func(user tradeUser) string {
		return tradeText(t, w.app, `SELECT count(*)::text FROM notifications WHERE user_id=$1`, user.id)
	}
	before := count(w.buyer)

	for _, price := range []string{"0", "0.00", "", "-1", "22.555", "1,5"} {
		res := w.seller.c.Do("POST", "/api/requests/"+id+"/offer", map[string]any{
			"items": []map[string]any{tradeLine(w.material, "5", price)},
		})
		if res.Status != 400 && res.Status != 422 {
			t.Fatalf("price %q: %d %s", price, res.Status, res.Raw)
		}
	}

	if got := tradeText(t, w.app, `SELECT status FROM transaction_requests WHERE id=$1`, id); got != "pending" {
		t.Fatalf("request status = %s, want pending", got)
	}
	if count(w.buyer) != before {
		t.Fatal("a rejected counter sent a notification")
	}

	tradeOffer(t, w.seller, id, w.material, "5", "22.55")
}

// S3: after the buyer confirms first, the buyer sees a pending purchase.
func TestRound4BuyerConfirmShowsPendingPurchase(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	tradeOffer(t, w.seller, id, w.material, "5", "9")
	tradeWant(t, "buyer confirms", w.buyer.c.Do("POST", "/api/requests/"+id+"/accept", nil), 200)

	pending := func(user tradeUser, path string) []string {
		var ids []string
		for _, row := range pageItems(t, status(t, user.c.Do("GET", path+"?status=pending", nil), 200)) {
			ids = append(ids, row["request_id"].(string))
		}

		return ids
	}

	if got := pending(w.buyer, "/api/transactions/purchases"); !slices.Contains(got, id) {
		t.Fatalf("buyer pending purchases = %v, want request %s", got, id)
	}
	if got := pending(w.seller, "/api/transactions/sales"); !slices.Contains(got, id) {
		t.Fatalf("seller pending sales = %v, want request %s", got, id)
	}
	if got := pending(stranger, "/api/transactions/purchases"); len(got) != 0 {
		t.Fatalf("stranger sees pending purchases: %v", got)
	}
}

// S9: the session signed in right now is listed even when the device cookie is empty.
func TestRound4SessionsListCurrentSession(t *testing.T) {
	app := testutil.Server(t)
	c := app.NewClient(t)
	email := signUp(t, app, c, true)
	signIn(t, c, email, goodPassword)
	c.SetCookie("threereco_devices", "")

	list, _ := c.Do("GET", "/api/auth/sessions", nil).Body["sessions"].([]any)
	if len(list) != 1 {
		t.Fatalf("sessions = %v, want just the current one", list)
	}

	row := list[0].(map[string]any)
	if row["current"] != true || row["email"] != email {
		t.Fatalf("current session row: %v", row)
	}

	other := app.NewClient(t)
	status(t, other.Do("GET", "/api/auth/sessions", nil), 401)
}

// S14: a cancelled request keeps a system line saying who cancelled.
func TestRound4CancelWritesSystemMessage(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	status(t, w.buyer.c.Do("POST", "/api/requests/"+id+"/cancel", nil), 200)

	name := tradeText(t, w.app, `SELECT business_name FROM users WHERE id=$1`, w.buyer.id)
	for _, user := range []tradeUser{w.buyer, w.seller} {
		var lines []string
		for _, row := range pageItems(t, status(t, user.c.Do("GET", "/api/requests/"+id+"/messages", nil), 200)) {
			if row["system"] == true {
				lines = append(lines, row["content"].(string))
			}
		}

		if !slices.Contains(lines, name+" cancelled this request.") {
			t.Fatalf("system lines = %v", lines)
		}
	}

	if got := stranger.c.Do("GET", "/api/requests/"+id+"/messages", nil); got.Status < 400 {
		t.Fatalf("stranger read the chat: %d", got.Status)
	}
}
