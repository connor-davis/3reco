// Package files coordinates authorized receipt storage.
package files

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/storage"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/transactions"
	store "github.com/connor-davis/3reco/internal/stores/files"
	tstore "github.com/connor-davis/3reco/internal/stores/transactions"
)

// Service owns receipt validation and storage compensation.
type Service struct {
	db      *database.DB
	store   *store.Store
	objects *storage.Client
	trades  *transactions.Service
}

// New builds the receipt service.
func New(
	db *database.DB,
	rows *store.Store,
	objects *storage.Client,
	trades *transactions.Service,
) *Service {
	return &Service{db: db, store: rows, objects: objects, trades: trades}
}

// Attach checks participation before reading or storing any supplied bytes.
func (s *Service) Attach(
	ctx context.Context,
	user auth.User,
	id, name string,
	reader io.Reader,
) (tstore.Receipt, error) {
	var receipt tstore.Receipt
	if _, err := s.trades.Participant(ctx, user, id); err != nil {
		return receipt, err
	}

	data, kind, err := storage.Image(reader, 5<<20, false)
	if err != nil {
		return receipt, err
	}

	sum := sha256.Sum256(data)
	checksum := hex.EncodeToString(sum[:])
	receipt = tstore.Receipt{
		ID: database.NewID(), FileName: storage.CleanName(name), ContentType: kind, Size: int64(len(data)),
	}
	key := "receipts/" + id + "/" + receipt.ID

	if err := s.objects.Put(ctx, key, bytes.NewReader(data), receipt.Size, kind); err != nil {
		return tstore.Receipt{}, err
	}

	err = s.db.InTx(ctx, func(ctx context.Context) error {
		if err := s.store.LockTransaction(ctx, id); err != nil {
			return err
		}

		count, duplicate, err := s.store.ReceiptCounts(ctx, id, checksum)
		if err != nil {
			return err
		}

		if duplicate {
			return apperr.Conflict("This receipt is already attached.")
		}

		if count >= 5 {
			return apperr.Conflict("A transaction can have at most five receipts.")
		}

		return s.store.InsertReceipt(ctx, id, user.ID, key, checksum, &receipt)
	})
	if err != nil {
		_ = s.objects.Remove(context.WithoutCancel(ctx), key)
		if _, unique := database.IsUnique(err); unique {
			err = apperr.Conflict("This receipt is already attached.")
		}
	}

	return receipt, err
}

// Download rechecks transaction access before resolving its receipt object.
func (s *Service) Download(
	ctx context.Context,
	user auth.User,
	id, receiptID string,
) (io.ReadCloser, tstore.Receipt, error) {
	if _, err := s.trades.Detail(ctx, user, id); err != nil {
		return nil, tstore.Receipt{}, err
	}

	key, receipt, err := s.store.ReceiptObject(ctx, id, receiptID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, receipt, apperr.NotFound("Receipt not found.")
	}
	if err != nil {
		return nil, receipt, err
	}

	reader, err := s.objects.Get(ctx, key)

	return reader, receipt, err
}

// Remove deletes one receipt. The caller must be able to read the trade
// (anyone else gets a 404) and be the uploader, its buyer or seller, or an
// admin (a staff reader gets a 403). The stored file goes only after the
// commit, so a rolled-back delete keeps it.
func (s *Service) Remove(ctx context.Context, user auth.User, id, receiptID string) error {
	trade, err := s.trades.Detail(ctx, user, id)
	if err != nil {
		return err
	}

	if auth.BusinessAtLeast(user, "member") && !auth.BusinessAtLeast(user, "manager") {
		return apperr.Forbidden("Only managers can remove receipts.")
	}

	return s.db.InTx(ctx, func(ctx context.Context) error {
		key, uploadedBy, found, err := s.store.LockReceipt(ctx, id, receiptID)
		if err != nil {
			return err
		}

		if !found {
			return apperr.NotFound("Receipt not found.")
		}

		party, err := s.trades.CanRemoveReceipts(ctx, user, trade)
		if err != nil {
			return err
		}

		if !party && uploadedBy != user.ID {
			return apperr.Forbidden("Only the people on this trade can remove a receipt.")
		}

		if err := s.store.DeleteReceipt(ctx, receiptID); err != nil {
			return err
		}

		s.objects.RemoveAfterCommit(ctx, key)

		return nil
	})
}
