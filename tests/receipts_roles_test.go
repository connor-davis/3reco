package tests

import "testing"

func TestReceiptUploadRoles(t *testing.T) {
	w := newTradeWorld(t)
	admin := tradeNewUser(t, w.app, "admin")
	staff := tradeNewUser(t, w.app, "staff")
	collectorUser := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, collectorUser.phone)

	collection := admin.c.Do(
		"POST",
		"/api/transactions/collections",
		tradeCollection(collector, w.buyer.id, tradeLine(w.material, "10", "6")),
	)
	tradeWant(t, "admin records collection", collection, 200)

	collectionID := collection.Body["transaction_id"].(string)
	collectionPath := "/api/transactions/" + collectionID + "/receipts"

	tradeWant(
		t,
		"admin uploads to collection",
		uploadImage(t, w.app, admin.c, collectionPath, receiptImage(1)),
		200,
	)
	tradeWant(
		t,
		"business buyer uploads to admin-recorded collection",
		uploadImage(t, w.app, w.buyer.c, collectionPath, receiptImage(2)),
		200,
	)
	tradeWant(
		t,
		"linked collector cannot upload",
		uploadImage(t, w.app, collectorUser.c, collectionPath, receiptImage(3)),
		404,
	)

	saleID := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")
	salePath := "/api/transactions/" + saleID + "/receipts"
	staffReceipt := uploadImage(t, w.app, staff.c, salePath, receiptImage(4))
	tradeWant(t, "staff uploads to business trade", staffReceipt, 200)

	staffReceiptPath := salePath + "/" + staffReceipt.Body["id"].(string)
	tradeWant(t, "staff removes own upload", staff.c.Do("DELETE", staffReceiptPath, nil), 200)

	buyerReceipt := uploadImage(t, w.app, w.buyer.c, salePath, receiptImage(5))
	tradeWant(t, "buyer uploads", buyerReceipt, 200)

	buyerReceiptPath := salePath + "/" + buyerReceipt.Body["id"].(string)
	tradeWant(
		t,
		"staff cannot remove another upload",
		staff.c.Do("DELETE", buyerReceiptPath, nil),
		403,
	)

	// An accepted offer keeps a pending trade until both parties confirm.
	requestID := marketRequest(t, w, "5")
	tradeOffer(t, w.seller, requestID, w.material, "5", "8")
	accepted := w.buyer.c.Do("POST", "/api/requests/"+requestID+"/accept", nil)
	tradeWant(t, "accept offer", accepted, 200)

	pendingID := accepted.Body["transaction_id"].(string)
	pendingPath := "/api/transactions/" + pendingID + "/receipts"

	for i, caller := range []tradeUser{admin, staff} {
		tradeWant(
			t,
			"pending trade rejects upload",
			uploadImage(t, w.app, caller.c, pendingPath, receiptImage(byte(6+i))),
			409,
		)
	}
}
