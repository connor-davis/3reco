// Package files validates image bytes and coordinates authorized receipt storage.
package files

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"

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

// Image reads at most limit+1 bytes and detects the actual file type.
func Image(reader io.Reader, limit int64, webp bool) ([]byte, string, error) {
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, "", apperr.BadRequest("Could not read the image.", nil)
	}

	if len(data) == 0 || int64(len(data)) > limit {
		return nil, "", apperr.BadRequest("The image must be nonempty and within the size limit.", nil)
	}

	kind := http.DetectContentType(data)
	if kind != "image/png" && kind != "image/jpeg" && !(webp && kind == "image/webp") {
		message := "Choose a PNG or JPEG image."
		if webp {
			message = "Choose a PNG, JPEG or WEBP image."
		}

		return nil, "", apperr.BadRequest(message, nil)
	}

	return data, kind, nil
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

	data, kind, err := Image(reader, 5<<20, false)
	if err != nil {
		return receipt, err
	}

	sum := sha256.Sum256(data)
	checksum := hex.EncodeToString(sum[:])
	receipt = tstore.Receipt{
		ID: database.NewID(), FileName: storage.SafeName(name), ContentType: kind, Size: int64(len(data)),
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
