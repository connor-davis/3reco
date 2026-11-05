package importer

import (
	"bytes"
	"encoding/json"
	"strings"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/storage"
	"github.com/connor-davis/3reco/internal/services/files"
	store "github.com/connor-davis/3reco/internal/stores/importer"
)

var requestStatuses = []string{"pending", "offered", "accepted", "rejected", "cancelled"}

// planTransactions maps transactions with their items, receipts and invoice.
// The id stays the Convex _id, so the invoice number (the last 8 characters
// of it) does not change.
func (p *planner) planTransactions() {
	itemFields := []field{
		{col: "material_id", key: "materialId", kind: kRef, required: true, refs: p.materials},
		{col: "weight", key: "weight", kind: kNum, required: true},
		{col: "price", key: "price", kind: kNum, required: true},
	}

	for _, d := range p.docs["transactions"] {
		r := newRow(p.rep, "transactions", d)

		// A seller is a user in a b2b sale and a collector in a c2b sale. A
		// collector can be deleted after the sale; the sale keeps a snapshot
		// of them, and seller_id has no foreign key, so that is fine.
		sellers, sellerKind := p.users, kRef
		if str(d["type"]) == "c2b" {
			sellers, sellerKind = p.collectors, kText

			if !p.collectors[str(d["sellerId"])] {
				if _, hasSnapshot := d["collectorSnapshot"].(map[string]any); hasSnapshot {
					p.rep.note("c2b sales whose collector was deleted (the snapshot is kept)")
				} else {
					newRow(p.rep, "transactions", d).fail("sellerId", "collector is gone and there is no snapshot")
				}
			}
		}

		out := r.build([]field{
			{col: "seller_id", key: "sellerId", kind: sellerKind, required: true, refs: sellers},
			{col: "buyer_id", key: "buyerId", kind: kRef, required: true, refs: p.users},
			{col: "type", key: "type", kind: kText, required: true, oneOf: []string{"c2b", "b2b"}},
			{col: "total_price", key: "totalPrice", kind: kNum, required: true},
			{col: "collection_day", key: "collectionDay", kind: kDate},
			{col: "collection_date", key: "collectionDate", kind: kTime},
		})
		r.created(out, false)

		if str(d["type"]) == "c2b" {
			p.collectorSnapshot(r, out)
		}

		for i, item := range r.list("items") {
			child := r.child("transaction_items", "items", i, item)
			row := without(child.build(itemFields))
			row["transaction_id"] = r.id
			row["position"] = int32(i)
			p.rows["transaction_items"] = append(p.rows["transaction_items"], row)
		}

		p.receipts(r)
		p.invoice(r, out)

		p.rows["transactions"] = append(p.rows["transactions"], out)
	}
}

// collectorSnapshot stores the frozen collector details under the column
// names Go reads them by (see snapshotColumns).
func (p *planner) collectorSnapshot(r *row, out store.Row) {
	snapshot, ok := r.d["collectorSnapshot"].(map[string]any)
	if !ok {
		return
	}

	renamed := map[string]any{}

	for key, value := range snapshot {
		column, known := snapshotColumns[key]
		if !known {
			continue
		}

		switch value.(type) {
		case string, json.Number:
			renamed[column] = value
		}
	}

	encoded, err := json.Marshal(renamed)
	if err != nil {
		r.fail("collectorSnapshot", "cannot be written as JSON")

		return
	}

	out["collector_snapshot"] = store.Typed{Type: "jsonb", Text: string(encoded)}
}

// receipts reads the receipt photos of one transaction: the first five, in
// order. Each is sniffed (PNG or JPEG) and hashed here, so the stored type
// and checksum come from the bytes and not from Convex.
func (p *planner) receipts(r *row) {
	seen := map[string]bool{}
	attachments := r.list("receiptAttachments")

	if len(attachments) > maxReceipts {
		p.rep.note("receipts dropped (more than 5 on one transaction)")

		attachments = attachments[:maxReceipts]
	}

	for i, attachment := range attachments {
		child := r.child("transaction_receipts", "receiptAttachments", i, attachment)
		storageID := child.text("storageId")

		by := child.build([]field{
			{col: "uploaded_by", key: "uploadedBy", kind: kRef, required: true, refs: p.users},
			{col: "uploaded_at", key: "uploadedAt", kind: kTime},
		})

		data, found, err := p.a.readBlob(storageID, maxReceiptBytes)
		if err != nil || !found {
			child.fail("storageId", "the receipt file is not in the export")

			continue
		}

		data, contentType, err := files.Image(bytes.NewReader(data), maxReceiptBytes, false)
		if err != nil {
			child.fail("storageId", "the receipt is not a PNG or JPEG under 5 MiB")

			continue
		}

		sum := checksum(data)
		if seen[sum] {
			p.rep.note("duplicate receipts dropped")

			continue
		}

		seen[sum] = true

		if p.storageDiffers(storageID, data) {
			p.rep.note("receipts whose size or sha256 differs from the export's record")
		}

		id := database.NewID()
		key := "receipts/" + r.id + "/" + id
		name := child.text("fileName")

		if name == "" {
			name = "receipt"
		}

		by["id"], by["transaction_id"], by["object_key"] = id, r.id, key
		by["file_name"], by["content_type"] = storage.SafeName(name), contentType
		by["size"], by["checksum"] = int64(len(data)), sum

		p.rows["transaction_receipts"] = append(p.rows["transaction_receipts"], by)
		p.blobs = append(p.blobs, blob{
			key: key, contentType: contentType, storageID: storageID, limit: maxReceiptBytes,
		})
	}
}

// invoice copies the generated PDF. With no PDF the column stays NULL and the
// app makes one when somebody opens the invoice.
func (p *planner) invoice(r *row, out store.Row) {
	storageID := r.text("invoiceStorageId")
	if storageID == "" {
		p.rep.note("transactions with no invoice PDF (made on demand)")

		return
	}

	data, found, err := p.a.readBlob(storageID, maxInvoiceBytes)
	if err != nil || !found {
		p.rep.note("invoice PDFs missing from the export (made on demand)")

		return
	}

	if !strings.HasPrefix(string(data[:min(len(data), 5)]), "%PDF-") || len(data) > maxInvoiceBytes {
		r.fail("invoiceStorageId", "the invoice file is not a PDF under 10 MiB")

		return
	}

	key := "invoices/" + r.id + "/" + database.NewID()
	out["invoice_key"] = key
	p.blobs = append(p.blobs, blob{
		key: key, contentType: "application/pdf", storageID: storageID, limit: maxInvoiceBytes,
	})
}

// planRequests maps requests, their items, their messages and a read mark
// for each message, so the old chats do not all show as unread.
func (p *planner) planRequests() {
	fields := []field{
		{col: "seller_id", key: "sellerId", kind: kRef, required: true, refs: p.users},
		{col: "buyer_id", key: "buyerId", kind: kRef, required: true, refs: p.users},
		{col: "status", key: "status", kind: kText, required: true, oneOf: requestStatuses},
	}

	for _, d := range p.docs["transactionRequests"] {
		r := newRow(p.rep, "transactionRequests", d)
		out := r.build(fields)
		r.created(out, true)

		seller, buyer := str(out["seller_id"]), str(out["buyer_id"])
		if seller != "" && seller == buyer {
			r.fail("buyerId", "a request cannot be to yourself")
		}

		p.requestParties[r.id] = [2]string{seller, buyer}
		p.rows["transaction_requests"] = append(p.rows["transaction_requests"], out)
		p.requestItems(r)
	}

	p.planMessages()
}

// requestItems reads the items array. A request from before items existed has
// one material, weight and price on the request itself: that becomes item 0.
func (p *planner) requestItems(r *row) {
	fields := []field{
		{col: "material_id", key: "materialId", kind: kRef, required: true, refs: p.materials},
		{col: "offer_weight", key: "offerWeight", kind: kNum},
		{col: "offer_price", key: "offerPrice", kind: kNum},
	}

	if r.d["items"] == nil {
		out := without(r.build(fields))
		out["request_id"], out["position"] = r.id, int32(0)
		p.rows["transaction_request_items"] = append(p.rows["transaction_request_items"], out)

		return
	}

	for i, item := range r.list("items") {
		child := r.child("transaction_request_items", "items", i, item)
		out := without(child.build(fields))
		out["request_id"], out["position"] = r.id, int32(i)

		// The database sets stock_id to NULL when the stock is deleted; do the same.
		if stockID := str(item["stockId"]); stockID != "" {
			if p.stock[stockID] {
				out["stock_id"] = stockID
			} else {
				p.rep.note("request items whose stock was deleted (stock_id left empty)")
			}
		}

		p.rows["transaction_request_items"] = append(p.rows["transaction_request_items"], out)
	}
}

// planMessages maps chat messages. Convex kept no read flag, so each message
// is marked read for the person who did not send it.
func (p *planner) planMessages() {
	fields := []field{
		{col: "request_id", key: "transactionId", kind: kText, required: true},
		{col: "sender_id", key: "senderId", kind: kRef, required: true, refs: p.users},
		{col: "content", key: "content", kind: kText, required: true},
	}

	for _, d := range p.docs["transactionRequestMessages"] {
		r := newRow(p.rep, "transactionRequestMessages", d)
		out := r.build(fields)
		r.created(out, false)

		requestID := str(out["request_id"])
		if !p.requests[requestID] {
			p.rep.note("messages dropped (their request is not in the export)")

			continue
		}

		p.rows["transaction_request_messages"] = append(p.rows["transaction_request_messages"], out)

		parties := p.requestParties[requestID]
		sender := str(out["sender_id"])

		for _, reader := range parties {
			if reader == "" || reader == sender {
				continue
			}

			p.rows["request_message_reads"] = append(p.rows["request_message_reads"], store.Row{
				"message_id": r.id, "user_id": reader, "read_at": out["created_at"],
			})
		}
	}
}
