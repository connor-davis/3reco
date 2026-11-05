package tests

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

// Everything in the import fixture is made up. The ids are shaped like Convex
// ids; the last eight letters of a transaction id are its invoice number.
const (
	fxSignin     = "usersignin00000000000000000001"
	fxBuyer      = "userbuyer000000000000000000002"
	fxUnverified = "userunverified000000000000000003"
	fxNoLogin    = "usernologin00000000000000000004"
	fxRemoved    = "userremoved0000000000000000005"
	fxAuthOnly   = "authonly000000000000000000006"
	fxCollector  = "collector0000000000000000000001"
	fxMaterial   = "material00000000000000000000001"
	fxMaterial2  = "material00000000000000000000002"
	fxStock      = "stock000000000000000000000001"
	fxTxC2B      = "txc2b000000000000000000AB12CD34EF"
	fxTxB2B      = "txb2b000000000000000000ZZ98YX76WV"
	fxRequest    = "request00000000000000000000001"
	fxLegacy     = "request00000000000000000000002"
	fxReceipt    = "storereceipt0000000000000001"
	fxInvoice    = "storeinvoice0000000000000001"
	fxSigninAuth = "ba0signin0000000000000000001"
	fxBuyerAuth  = "ba0buyer00000000000000000002"
	fxUnverAuth  = "ba0unverified000000000000003"
)

const fxCents = "0.30000000000000004" // 0.1 + 0.2 as JavaScript stores it

type fxTable []map[string]any

// fxExport is the made-up export: tables by folder, and blobs by file name.
type fxExport struct {
	tables map[string]fxTable
	blobs  map[string][]byte
}

func fxPNG(shade uint8) []byte {
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: shade, A: 255})

	var buf bytes.Buffer
	_ = png.Encode(&buf, img)

	return buf.Bytes()
}

func fxPNGDataURL(shade uint8) string {
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(fxPNG(shade))
}

// newFixture returns a small export that touches every table and rule.
func newFixture() *fxExport {
	receipt := fxPNG(200)
	invoice := []byte("%PDF-1.4 a made-up invoice")
	receiptSum := sha256.Sum256(receipt)
	n := func(text string) json.Number { return json.Number(text) }

	return &fxExport{
		blobs: map[string][]byte{
			"_storage/" + fxReceipt + ".png": receipt,
			"_storage/" + fxInvoice + ".pdf": invoice,
		},
		tables: map[string]fxTable{
			"_storage": {{
				"_id": fxReceipt, "_creationTime": 1.0, "size": len(receipt),
				"sha256": hex.EncodeToString(receiptSum[:]), "contentType": "image/png",
			}},
			"users": {
				{"_id": fxSignin, "_creationTime": 1700000000000.5, "authId": fxSigninAuth,
					"name": "Sign In", "role": "business", "businessName": "Sign In Biz",
					"emailVerificationTime": 1700000001000.0, "normalizedPhone": "+27821110001",
					"image": "https://example.test/a.png", "areaCode": 2000.0, "province": "Gauteng"},
				{"_id": fxBuyer, "_creationTime": 1700000002000.0, "authId": fxBuyerAuth,
					"name": "Buyer", "role": "business", "emailVerificationTime": 1700000003000.0,
					"image": fxPNGDataURL(50)},
				{"_id": fxUnverified, "_creationTime": 1700000004000.0, "authId": fxUnverAuth,
					"name": "Unverified", "role": "collector"},
				{"_id": fxNoLogin, "_creationTime": 1700000005000.0, "name": "No Login",
					"email": "nologin@example.test"},
				{"_id": fxRemoved, "_creationTime": 1700000006000.0, "name": "Gone Person",
					"email": "gone@example.test", "phone": "0821110009", "isRemoved": true,
					"removedAt": 1700000007000.0, "removedBy": fxSignin},
			},
			"_components/betterAuth/user": {
				{"_id": fxSigninAuth, "_creationTime": 1.0, "name": "Sign In",
					"email": "signin@example.test", "emailVerified": true},
				{"_id": fxBuyerAuth, "_creationTime": 1.0, "name": "Buyer",
					"email": "buyer@example.test", "emailVerified": true},
				{"_id": fxUnverAuth, "_creationTime": 1.0, "name": "Unverified",
					"email": "unverified@example.test", "emailVerified": false},
				{"_id": fxAuthOnly, "_creationTime": 1700000008000.0, "name": "Auth Only",
					"email": "authonly@example.test", "emailVerified": true},
			},
			"_components/betterAuth/account": {
				{"_id": "acc1", "userId": fxSigninAuth, "providerId": "credential",
					"password": legacyVectors[0].hash},
				{"_id": "acc2", "userId": fxBuyerAuth, "providerId": "credential",
					"password": legacyVectors[1].hash},
				{"_id": "acc3", "userId": fxUnverAuth, "providerId": "credential",
					"password": legacyVectors[0].hash},
				{"_id": "acc4", "userId": fxAuthOnly, "providerId": "credential",
					"password": legacyVectors[1].hash},
			},
			"collectors": {{
				"_id": fxCollector, "_creationTime": 1700000010000.0, "name": "Collector",
				"phone": "082 111 0002", "normalizedPhone": "+27821110002", "payoutMethod": "bank",
				"bankAccountType": "Savings", "createdByUserId": fxSignin,
			}},
			"materials": {
				{"_id": fxMaterial, "_creationTime": 1700000011000.0, "name": "PET",
					"carbonFactor": "0.5", "gwCode": "G1", "price": n(fxCents)},
				{"_id": fxMaterial2, "_creationTime": 1700000012000.0, "name": "Glass",
					"carbonFactor": "1.25", "gwCode": "G2", "price": n("12.5")},
			},
			"stock": {{
				"_id": fxStock, "_creationTime": 1700000013000.0, "ownerId": fxSignin,
				"materialId": fxMaterial, "weight": n(fxCents), "price": n("0.2"), "isListed": true,
			}},
			"transactions": {
				{"_id": fxTxC2B, "_creationTime": 1700000020000.0, "type": "c2b",
					"sellerId": fxCollector, "buyerId": fxBuyer, "totalPrice": n(fxCents),
					"collectionDay": "2025-03-14", "collectionDate": 1741910400000.0,
					"collectorSnapshot": map[string]any{
						"name": "Collector", "streetAddress": "1 Main Road", "areaCode": 2000.0,
						"bankAccountNumber": "12345678", "payoutMethod": "bank",
					},
					"items": []any{
						map[string]any{"materialId": fxMaterial, "weight": n("1.5"), "price": n("2")},
						map[string]any{"materialId": fxMaterial2, "weight": n("3"), "price": n(fxCents)},
					},
					"receiptAttachments": []any{map[string]any{
						"storageId": fxReceipt, "fileName": "My Receipt.JPG",
						"uploadedBy": fxSignin, "uploadedAt": 1700000021000.0,
					}},
					"invoiceStorageId": fxInvoice,
				},
				{"_id": fxTxB2B, "_creationTime": 1700000030000.0, "type": "b2b",
					"sellerId": fxSignin, "buyerId": fxBuyer, "totalPrice": n("10"),
					"items": []any{map[string]any{"materialId": fxMaterial, "weight": n("2"), "price": n("5")}},
				},
			},
			"transactionRequests": {
				{"_id": fxRequest, "_creationTime": 1700000040000.0, "sellerId": fxSignin,
					"buyerId": fxBuyer, "status": "offered", "items": []any{
						map[string]any{"materialId": fxMaterial, "stockId": fxStock,
							"offerWeight": n("1"), "offerPrice": n("2")},
						map[string]any{"materialId": fxMaterial2, "stockId": "stockdeleted0000000000000000001",
							"offerWeight": n("1"), "offerPrice": n("2")},
					}},
				{"_id": fxLegacy, "_creationTime": 1700000041000.0, "sellerId": fxSignin,
					"buyerId": fxBuyer, "status": "pending", "materialId": fxMaterial2,
					"offerWeight": n("4"), "offerPrice": n("5")},
			},
			"transactionRequestMessages": {
				{"_id": "message000000000000000000001", "_creationTime": 1700000050000.0,
					"transactionId": fxRequest, "senderId": fxBuyer, "content": "hello"},
				{"_id": "message000000000000000000002", "_creationTime": 1700000051000.0,
					"transactionId": fxRequest, "senderId": fxSignin, "content": "hi"},
			},
			"notifications": {{
				"_id": "notice000000000000000000001", "_creationTime": 1700000060000.0,
				"userId": fxSignin, "type": "request_received", "title": "T", "body": "B",
				"read": false,
			}},
			"carts": {{
				"_id": "cart0000000000000000000001", "_creationTime": 1700000070000.0,
				"buyerId": fxBuyer, "sellerId": fxSignin,
				"items": []any{map[string]any{"stockId": fxStock, "materialId": fxMaterial}},
			}},
			"storeReviews": {{
				"_id": "review000000000000000000001", "_creationTime": 1700000080000.0,
				"sellerId": fxSignin, "buyerId": fxBuyer, "transactionId": fxTxB2B, "rating": 5.0,
			}},
		},
	}
}

// zipFile writes the export as a ZIP in a temp folder and returns its path.
func (e *fxExport) zipFile(t *testing.T) string {
	t.Helper()

	var buf bytes.Buffer

	w := zip.NewWriter(&buf)

	add := func(name string, body []byte) {
		f, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}

		_, _ = f.Write(body)
	}

	for table, rows := range e.tables {
		var lines bytes.Buffer

		for _, row := range rows {
			encoded, err := json.Marshal(row)
			if err != nil {
				t.Fatal(err)
			}

			lines.Write(encoded)
			lines.WriteByte('\n')
		}

		add(table+"/documents.jsonl", lines.Bytes())
	}

	for name, body := range e.blobs {
		add(name, body)
	}

	if err := w.Close(); err != nil {
		t.Fatal(err)
	}

	path := filepath.Join(t.TempDir(), "export.zip")
	if err := os.WriteFile(path, buf.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}

	return path
}
