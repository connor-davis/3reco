// Package files owns receipt metadata and private object references.
package files

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
	tstore "github.com/connor-davis/3reco/internal/stores/transactions"
)

// Store runs file metadata SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// LockTransaction serializes receipt attachments to one transaction.
func (s *Store) LockTransaction(ctx context.Context, id string) error {
	var locked string

	return s.db.Q(ctx).QueryRow(ctx,
		`SELECT id FROM transactions WHERE id=$1 FOR UPDATE`, id).Scan(&locked)
}

// ReceiptCounts checks duplicates before the five-file limit.
func (s *Store) ReceiptCounts(ctx context.Context, id, checksum string) (int, bool, error) {
	var count int
	var duplicate bool

	err := s.db.Q(ctx).QueryRow(ctx, `SELECT count(*), COALESCE(bool_or(checksum=$2),false)
		FROM transaction_receipts WHERE transaction_id=$1`, id, checksum).Scan(&count, &duplicate)

	return count, duplicate, err
}

// InsertReceipt saves a validated attachment and returns its public metadata.
func (s *Store) InsertReceipt(
	ctx context.Context,
	transactionID, userID, key, checksum string,
	receipt *tstore.Receipt,
) error {
	return s.db.Q(ctx).QueryRow(ctx, `INSERT INTO transaction_receipts
		(id,transaction_id,object_key,file_name,content_type,size,checksum,uploaded_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING uploaded_at`,
		receipt.ID, transactionID, key, receipt.FileName, receipt.ContentType,
		receipt.Size, checksum, userID).Scan(&receipt.UploadedAt)
}

// ReceiptObject finds a receipt only inside its transaction.
func (s *Store) ReceiptObject(
	ctx context.Context,
	id, receiptID string,
) (string, tstore.Receipt, error) {
	var key string
	var receipt tstore.Receipt

	err := s.db.Q(ctx).QueryRow(ctx, `SELECT object_key,id,file_name,content_type,size,uploaded_at
		FROM transaction_receipts WHERE transaction_id=$1 AND id=$2`, id, receiptID).Scan(
		&key, &receipt.ID, &receipt.FileName, &receipt.ContentType, &receipt.Size, &receipt.UploadedAt)

	return key, receipt, err
}
