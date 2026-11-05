// Package reviews holds the rules for store reviews: only the buyer of a
// business trade may review it, once.
package reviews

import (
	"context"
	"time"
	"unicode/utf8"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	store "github.com/connor-davis/3reco/internal/stores/reviews"
)

const maxCommentRunes = 1000

// Service is the review rules.
type Service struct {
	db    *database.DB
	store *store.Store
}

// New builds the service.
func New(db *database.DB, s *store.Store) *Service { return &Service{db: db, store: s} }

// BySeller lists the public reviews of a seller. They are public on purpose;
// the projection holds no private reviewer data.
func (s *Service) BySeller(
	ctx context.Context,
	sellerID, cursor string,
	limit int,
) (paging.Page[store.Review], error) {
	var empty paging.Page[store.Review]

	cur, err := paging.ParseCursor(cursor)
	if err != nil {
		return empty, err
	}

	rows, err := s.store.BySeller(ctx, sellerID, cur, limit)
	if err != nil {
		return empty, err
	}

	return paging.Build(rows, limit, func(r store.Review) (time.Time, string) {
		return r.CreatedAt, r.ID
	}), nil
}

// Summary returns a seller's average rating and review count.
func (s *Service) Summary(ctx context.Context, sellerID string) (store.Summary, error) {
	return s.store.Average(ctx, sellerID)
}

// Reviewable lists the caller's business trades with a seller they have not
// reviewed. It only ever looks at the caller's own purchases.
func (s *Service) Reviewable(
	ctx context.Context,
	buyerID, sellerID string,
) ([]store.Reviewable, error) {
	if sellerID == "" {
		return nil, apperr.Field("seller_id", "Say which seller.")
	}

	return s.store.Reviewable(ctx, buyerID, sellerID)
}

// Add stores a review of a transaction by its buyer. Someone else's
// transaction is a 404, so it can't be told apart from a missing one.
func (s *Service) Add(
	ctx context.Context,
	buyerID, transactionID string,
	rating int,
	comment string,
) (string, error) {
	if rating < 1 || rating > 5 {
		return "", apperr.Field("rating", "Rating must be a whole number from 1 to 5.")
	}

	if utf8.RuneCountInString(comment) > maxCommentRunes {
		return "", apperr.Field("comment", "That comment is too long.")
	}

	trade, found, err := s.store.Trade(ctx, transactionID)
	if err != nil {
		return "", err
	}

	if !found || trade.BuyerID != buyerID {
		return "", apperr.NotFound("Transaction not found.")
	}

	if trade.Type != "b2b" {
		return "", apperr.BadRequest("Collector transactions cannot be reviewed.", nil)
	}

	id := database.NewID()

	err = s.store.Insert(ctx, id, transactionID, trade.SellerID, buyerID, rating, comment)
	if _, taken := database.IsUnique(err); taken {
		return "", apperr.Conflict("You have already reviewed this transaction.").
			WithCode("already_reviewed")
	}

	return id, err
}

// Remove deletes a review. The route is admin-only.
func (s *Service) Remove(ctx context.Context, id string) error {
	found, err := s.store.Delete(ctx, id)
	if err != nil {
		return err
	}

	if !found {
		return apperr.NotFound("Review not found.")
	}

	return nil
}
