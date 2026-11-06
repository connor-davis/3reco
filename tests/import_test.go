package tests

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"strings"
	"testing"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/connor-davis/3reco/internal/services/importer"
	store "github.com/connor-davis/3reco/internal/stores/importer"
	tstore "github.com/connor-davis/3reco/internal/stores/transactions"
	"github.com/connor-davis/3reco/tests/testutil"
)

// importFixture runs the importer on the made-up export against a fresh app.
func importFixture(t *testing.T) (*testutil.App, *importer.Report) {
	t.Helper()

	app := testutil.Server(t)

	report, err := importer.Run(context.Background(), app.DB, app.Storage, testutil.Cipher(t), newFixture().zipFile(t))
	if err != nil {
		t.Fatalf("import: %v\n%s", err, printed(report))
	}

	return app, report
}

func printed(report *importer.Report) string {
	var out bytes.Buffer

	if report != nil {
		report.Print(&out)
	}

	return out.String()
}

func TestImportEmailOnlyCollectors(t *testing.T) {
	app := testutil.Server(t)
	fixture := newFixture()
	original := fixture.tables["collectors"][0]
	delete(original, "phone")
	delete(original, "normalizedPhone")
	original["email"] = "collector@example.test"

	second := map[string]any{}
	for key, value := range original {
		second[key] = value
	}
	second["_id"] = "emailonlycollector000000000002"
	second["phone"], second["normalizedPhone"] = "", ""
	fixture.tables["collectors"] = append(fixture.tables["collectors"], second)

	report, err := importer.Run(context.Background(), app.DB, app.Storage,
		testutil.Cipher(t), fixture.zipFile(t))
	if err != nil {
		t.Fatalf("email-only import: %v\n%s", err, printed(report))
	}
	if count := tradeText(t, app, `SELECT count(*)::text FROM collectors
		WHERE phone IS NULL AND normalized_phone IS NULL`); count != "2" {
		t.Fatalf("NULL phones: %s", count)
	}
}

// storedKeys lists every object in the test bucket.
func storedKeys(t *testing.T, app *testutil.App) []string {
	t.Helper()

	client, err := minio.New(app.Config.S3Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(app.Config.S3AccessKey, app.Config.S3SecretKey, ""),
		Secure: app.Config.S3UseTLS, Region: app.Config.S3Region,
	})
	if err != nil {
		t.Fatal(err)
	}

	var keys []string

	for object := range client.ListObjects(context.Background(), app.Config.S3Bucket,
		minio.ListObjectsOptions{Recursive: true}) {
		if object.Err != nil {
			t.Fatal(object.Err)
		}

		keys = append(keys, object.Key)
	}

	return keys
}

func objectBytes(t *testing.T, app *testutil.App, key string) []byte {
	t.Helper()

	body, err := app.Storage.Get(context.Background(), key)
	if err != nil {
		t.Fatalf("object %s: %v", key, err)
	}
	defer body.Close()

	data, err := io.ReadAll(body)
	if err != nil {
		t.Fatal(err)
	}

	return data
}

func TestImportCountsAndIdsKept(t *testing.T) {
	app, report := importFixture(t)

	if n := tradeText(t, app, `
		SELECT count(*)::text FROM transaction_requests r
		WHERE activity_at <> COALESCE(
			(SELECT max(created_at) FROM transaction_request_messages WHERE request_id = r.id),
			r.created_at)`); n != "0" {
		t.Errorf("%s imported inbox timestamps do not match historical activity", n)
	}

	want := map[string]int{
		"users": 6, "collectors": 1, "materials": 2, "stock": 1, "transactions": 3,
		"transaction_items": 3, "transaction_receipts": 1, "transaction_requests": 2,
		"transaction_request_items": 3, "transaction_request_messages": 2,
		"request_message_reads": 2, "notifications": 1, "carts": 1, "cart_items": 1,
		"store_reviews": 1,
	}

	for _, count := range report.Tables {
		if count.Source != want[count.Table] || count.Loaded != want[count.Table] {
			t.Errorf("%s: source %d, loaded %d, want %d", count.Table, count.Source,
				count.Loaded, want[count.Table])
		}
	}

	if len(report.Tables) != len(want) {
		t.Errorf("report has %d tables, want %d", len(report.Tables), len(want))
	}

	if out := printed(report); !strings.Contains(out, "transaction_items") {
		t.Errorf("printed report has no counts:\n%s", out)
	}

	for table, id := range map[string]string{
		"users": fxSignin, "transactions": fxTxC2B, "collectors": fxCollector,
		"materials": fxMaterial, "transaction_requests": fxLegacy,
	} {
		if got := tradeText(t, app, "SELECT id FROM "+table+" WHERE id = $1", id); got != id {
			t.Errorf("%s: id %s not kept", table, id)
		}
	}

	if report.Notes["c2b sales whose collector was deleted (the snapshot is kept)"] != 1 {
		t.Errorf("notes: %v", report.Notes)
	}

	if report.Notes["users from a login with no app profile"] != 1 {
		t.Errorf("notes: %v", report.Notes)
	}
}

func TestImportInvoiceNumberUnchanged(t *testing.T) {
	app, _ := importFixture(t)
	c := app.NewClient(t)

	// The buyer signs in with the old password (legacy vector 1).
	if res := signIn(t, c, "buyer@example.test", legacyVectors[1].password); res.Status != 200 {
		t.Fatalf("buyer sign-in: %d %s", res.Status, res.Raw)
	}

	res := c.Do("GET", "/api/transactions/"+fxTxC2B, nil)
	if res.Status != 200 {
		t.Fatalf("transaction: %d %s", res.Status, res.Raw)
	}

	if got := res.Body["invoice_number"]; got != "12CD34EF" {
		t.Errorf("invoice number %v, want 12CD34EF", got)
	}
}

func TestImportOldPasswordSignsIn(t *testing.T) {
	app, _ := importFixture(t)
	c := app.NewClient(t)

	if res := signIn(t, c, "signin@example.test", "wrong password"); res.Status != 401 {
		t.Fatalf("wrong password: %d", res.Status)
	}

	if res := signIn(t, c, "signin@example.test", legacyVectors[0].password); res.Status != 200 {
		t.Fatalf("old password: %d %s", res.Status, res.Raw)
	}

	hash := tradeText(t, app, `SELECT password_hash FROM users WHERE id = $1`, fxSignin)
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Errorf("hash was not upgraded: %.12s", hash)
	}

	// An unverified login with the right password is told to verify first.
	res := c.Do("POST", "/api/auth/sign-in", map[string]any{
		"email": "unverified@example.test", "password": legacyVectors[0].password,
	})
	if res.Status != 403 || !strings.Contains(string(res.Raw), "email_not_verified") {
		t.Errorf("unverified: %d %s", res.Status, res.Raw)
	}

	// A login with no app profile can sign in and finish the profile.
	if res := signIn(t, app.NewClient(t), "authonly@example.test", legacyVectors[1].password); res.Status != 200 {
		t.Errorf("auth-only login: %d %s", res.Status, res.Raw)
	}

	if got := tradeText(t, app, `SELECT coalesce(role,'none') || profile_complete::text
		FROM users WHERE id = $1`, fxAuthOnly); got != "nonefalse" {
		t.Errorf("auth-only user: %s", got)
	}
}

func TestImportFilesLandInStorage(t *testing.T) {
	app, _ := importFixture(t)

	receipt := fxPNG(200)
	sum := sha256.Sum256(receipt)

	key := tradeText(t, app, `SELECT object_key FROM transaction_receipts WHERE transaction_id = $1`, fxTxC2B)
	if !strings.HasPrefix(key, "receipts/"+fxTxC2B+"/") {
		t.Fatalf("receipt key %q", key)
	}

	if got := objectBytes(t, app, key); !bytes.Equal(got, receipt) {
		t.Error("receipt bytes differ")
	}

	row := tradeText(t, app, `SELECT checksum || '|' || size || '|' || content_type || '|' || file_name
		FROM transaction_receipts WHERE transaction_id = $1`, fxTxC2B)
	if want := hex.EncodeToString(sum[:]) + "|" + strconv.Itoa(len(receipt)) + "|image/png|my_receipt.jpg"; row != want {
		t.Errorf("receipt row %q, want %q", row, want)
	}

	invoice := tradeText(t, app, `SELECT invoice_key FROM transactions WHERE id = $1`, fxTxC2B)
	if !strings.HasPrefix(invoice, "invoices/"+fxTxC2B+"/") ||
		!strings.HasPrefix(string(objectBytes(t, app, invoice)), "%PDF-") {
		t.Errorf("invoice key %q", invoice)
	}

	if got := tradeText(t, app, `SELECT invoice_key FROM transactions WHERE id = $1`, fxTxB2B); got != "" {
		t.Errorf("a sale with no PDF has invoice key %q", got)
	}

	avatar := tradeText(t, app, `SELECT avatar_key FROM users WHERE id = $1 AND image IS NULL`, fxBuyer)
	if !strings.HasPrefix(avatar, "avatars/"+fxBuyer+"/") || len(objectBytes(t, app, avatar)) == 0 {
		t.Errorf("avatar key %q", avatar)
	}

	if got := tradeText(t, app, `SELECT image FROM users WHERE id = $1 AND avatar_key IS NULL`, fxSignin); got != "https://example.test/a.png" {
		t.Errorf("web address picture: %q", got)
	}

	if n := len(storedKeys(t, app)); n != 3 {
		t.Errorf("%d objects in storage, want 3", n)
	}
}

func TestImportMoneyIsExact(t *testing.T) {
	app, _ := importFixture(t)

	for _, check := range []struct{ sql, want string }{
		{`SELECT total_price::text FROM transactions WHERE id = '` + fxTxC2B + `'`, fxCents},
		{`SELECT price::text FROM materials WHERE id = '` + fxMaterial + `'`, fxCents},
		{`SELECT weight::text FROM stock WHERE id = '` + fxStock + `'`, fxCents},
		{`SELECT price::text FROM transaction_items WHERE transaction_id = '` + fxTxC2B + `' AND position = 1`, fxCents},
		{`SELECT carbon_factor::text FROM materials WHERE id = '` + fxMaterial2 + `'`, "1.25"},
	} {
		if got := tradeText(t, app, check.sql); got != check.want {
			t.Errorf("%s = %s, want %s", check.sql, got, check.want)
		}
	}
}

func TestImportMessagesAreRead(t *testing.T) {
	app, _ := importFixture(t)

	// The buyer wrote message 1, so the seller reads it; the other way round for 2.
	for message, reader := range map[string]string{
		"message000000000000000000001": fxSignin, "message000000000000000000002": fxBuyer,
	} {
		got := tradeText(t, app, `SELECT user_id FROM request_message_reads WHERE message_id = $1`, message)
		if got != reader {
			t.Errorf("message %s read by %q, want %s", message, got, reader)
		}
	}
}

func TestImportRowShapes(t *testing.T) {
	app, _ := importFixture(t)

	if got := tradeText(t, app, `SELECT string_agg(position::text, ',' ORDER BY position)
		FROM transaction_items WHERE transaction_id = $1`, fxTxC2B); got != "0,1" {
		t.Errorf("item positions %q", got)
	}

	// Snapshot keys use the Go column names.
	if got := tradeText(t, app, `SELECT string_agg(key, ',' ORDER BY key)
		FROM transactions, jsonb_object_keys(collector_snapshot) key WHERE id = $1`, fxTxC2B); got !=
		"area_code,bank_account_number,name,payout_method,street_address" {
		t.Errorf("snapshot keys %q", got)
	}

	if got := tradeText(t, app, `SELECT (collector_snapshot IS NULL)::text FROM transactions WHERE id = $1`, fxTxB2B); got != "true" {
		t.Errorf("b2b sale has a snapshot")
	}

	if got := tradeText(t, app, `SELECT normalized_phone FROM collectors WHERE id = $1`, fxCollector); got != "+27821110002" {
		t.Errorf("collector phone %q", got)
	}

	// A request item whose stock was deleted keeps its row with no stock.
	if got := tradeText(t, app, `SELECT count(*) FROM transaction_request_items
		WHERE request_id = $1 AND stock_id IS NULL`, fxRequest); got != "1" {
		t.Errorf("items with no stock: %s", got)
	}

	// The old single-item request becomes item 0.
	if got := tradeText(t, app, `SELECT position || material_id || offer_weight::text
		FROM transaction_request_items WHERE request_id = $1`, fxLegacy); got != "0"+fxMaterial2+"4" {
		t.Errorf("legacy item %q", got)
	}
}

func TestImportRemovedUser(t *testing.T) {
	app, _ := importFixture(t)

	got := tradeText(t, app, `SELECT is_removed::text || '|' || (email IS NULL)::text || '|' ||
		(password_hash IS NULL)::text || '|' || (phone IS NULL)::text || '|' || name || '|' || removed_by
		FROM users WHERE id = $1`, fxRemoved)
	if want := "true|true|true|true|Removed account|" + fxSignin; got != want {
		t.Errorf("removed user %q, want %q", got, want)
	}
}

func TestImportRefusesASecondRun(t *testing.T) {
	app, _ := importFixture(t)

	before := tradeText(t, app, `SELECT (SELECT count(*) FROM users) || '/' || (SELECT count(*) FROM transactions)`)

	_, err := importer.Run(context.Background(), app.DB, app.Storage, testutil.Cipher(t), newFixture().zipFile(t))

	var notEmpty *store.NotEmptyError
	if !errors.As(err, &notEmpty) {
		t.Fatalf("second run: %v, want a not-empty error", err)
	}

	after := tradeText(t, app, `SELECT (SELECT count(*) FROM users) || '/' || (SELECT count(*) FROM transactions)`)
	if before != after {
		t.Errorf("rows changed: %s -> %s", before, after)
	}

	if n := len(storedKeys(t, app)); n != 3 {
		t.Errorf("%d objects after a refused run, want 3", n)
	}
}

func TestImportStrictRefusesBadRows(t *testing.T) {
	app := testutil.Server(t)
	fixture := newFixture()

	// Two logins share one email, ignoring case; a stock row points at nobody.
	fixture.tables["users"][3]["email"] = "SIGNIN@example.test"
	fixture.tables["stock"][0]["ownerId"] = "nobody"

	report, err := importer.Run(context.Background(), app.DB, app.Storage, testutil.Cipher(t), fixture.zipFile(t))

	var invalid *importer.InvalidError
	if !errors.As(err, &invalid) {
		t.Fatalf("err = %v, want InvalidError", err)
	}

	found := map[string]bool{}
	for _, problem := range report.Problems {
		found[problem.Table+"/"+problem.Field] = problem.ID != "" && problem.Reason != ""
	}

	if !found["users/email"] || !found["stock/ownerId"] {
		t.Errorf("problems: %+v", report.Problems)
	}

	for _, table := range []string{"users", "stock", "transactions", "materials", "collectors"} {
		if got := tradeText(t, app, "SELECT count(*) FROM "+table); got != "0" {
			t.Errorf("%s has %s rows after a refused import", table, got)
		}
	}

	if keys := storedKeys(t, app); len(keys) != 0 {
		t.Errorf("storage is not clean: %v", keys)
	}
}

func TestImportRollsBackFilesWhenTheDatabaseFails(t *testing.T) {
	app := testutil.Server(t)
	fixture := newFixture()

	// Looks like a number to the checks, but Postgres numeric cannot hold it,
	// so the failure comes late: after the files are already in storage.
	fixture.tables["transactions"][1]["totalPrice"] = json.Number("1e999999")

	_, err := importer.Run(context.Background(), app.DB, app.Storage, testutil.Cipher(t), fixture.zipFile(t))
	if err == nil {
		t.Fatal("import of an impossible number succeeded")
	}

	if got := tradeText(t, app, `SELECT count(*) FROM users`); got != "0" {
		t.Errorf("users after a rollback: %s", got)
	}

	if keys := storedKeys(t, app); len(keys) != 0 {
		t.Errorf("files left behind: %v", keys)
	}
}

func TestImportDeletedCollectorKeepsTheSnapshot(t *testing.T) {
	app, _ := importFixture(t)

	doc, err := tstore.New(app.DB, testutil.Cipher(t)).Document(context.Background(), fxTxGone)
	if err != nil {
		t.Fatal(err)
	}

	if doc.Seller.Name != "Deleted Collector" || doc.Seller.City != "Durban" {
		t.Errorf("invoice seller %+v, want the snapshot details", doc.Seller)
	}
}

func TestImportStrictRefusesADeletedCollectorWithNoSnapshot(t *testing.T) {
	app := testutil.Server(t)
	fixture := newFixture()

	delete(fixture.tables["transactions"][1], "collectorSnapshot")

	report, err := importer.Run(context.Background(), app.DB, app.Storage, testutil.Cipher(t), fixture.zipFile(t))

	var invalid *importer.InvalidError
	if !errors.As(err, &invalid) || len(report.Problems) != 1 {
		t.Fatalf("err = %v, problems %+v", err, report.Problems)
	}

	if p := report.Problems[0]; p.Table != "transactions" || p.ID != fxTxGone || p.Field != "sellerId" {
		t.Errorf("problem %+v does not name the sale", p)
	}

	if got := tradeText(t, app, `SELECT count(*) FROM users`); got != "0" {
		t.Errorf("users after a refused import: %s", got)
	}

	if keys := storedKeys(t, app); len(keys) != 0 {
		t.Errorf("storage is not clean: %v", keys)
	}
}
