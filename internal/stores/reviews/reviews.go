// Package reviews is the database access for store reviews. SQL only; the
// rules live in services/reviews.
package reviews

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Review is what the public sees of a review: the rating, the words and a
// safe display name. It holds no buyer id, email or transaction id.
type Review struct {
	ID           string    `json:"id"`
	Rating       int       `json:"rating"`
	Comment      *string   `json:"comment"`
	ReviewerName string    `json:"reviewer_name"`
	CreatedAt    time.Time `json:"created_at"`
}

// Summary is the average rating and how many reviews it covers.
type Summary struct {
	Average *float64 `json:"average"`
	Count   int      `json:"count"`
}

// Reviewable is a finished trade the buyer has not reviewed yet.
type Reviewable struct {
	TransactionID string    `json:"transaction_id"`
	TotalPrice    string    `json:"total_price"`
	CreatedAt     time.Time `json:"created_at"`
}

// Trade is the part of a transaction a review needs to check.
type Trade struct{ BuyerID, SellerID, Type string }

// Store runs the review SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// BySeller returns up to limit+1 reviews of a seller, newest first.
func (s *Store) BySeller(
	ctx context.Context,
	sellerID string,
	cur paging.Cursor,
	limit int,
) ([]Review, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT r.id, r.rating, r.comment, `+database.DisplayName("u")+`, r.created_at
		FROM store_reviews r JOIN users u ON u.id = r.buyer_id
		WHERE r.seller_id = $1 AND ($2::timestamptz IS NULL OR (r.created_at, r.id) < ($2, $3))
		ORDER BY r.created_at DESC, r.id DESC
		LIMIT $4`, sellerID, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Review

	for rows.Next() {
		var r Review

		if err := rows.Scan(&r.ID, &r.Rating, &r.Comment, &r.ReviewerName, &r.CreatedAt); err != nil {
			return nil, err
		}

		out = append(out, r)
	}

	return out, rows.Err()
}

// Average returns the mean rating of a seller, rounded to one decimal.
func (s *Store) Average(ctx context.Context, sellerID string) (Summary, error) {
	var sum Summary

	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT ROUND(AVG(rating), 1)::float8, count(*) FROM store_reviews WHERE seller_id = $1`,
		sellerID).Scan(&sum.Average, &sum.Count)

	return sum, err
}

// Reviewable lists the buyer's business trades with a seller that have no
// review yet.
func (s *Store) Reviewable(ctx context.Context, buyerID, sellerID string) ([]Reviewable, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT t.id, t.total_price::text, t.created_at FROM transactions t
		WHERE t.status='complete' AND t.buyer_id = $1 AND t.seller_id = $2 AND t.type = 'b2b'
			AND NOT EXISTS (SELECT 1 FROM store_reviews r WHERE r.transaction_id = t.id)
		ORDER BY t.created_at DESC, t.id DESC`, buyerID, sellerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Reviewable{}

	for rows.Next() {
		var r Reviewable

		if err := rows.Scan(&r.TransactionID, &r.TotalPrice, &r.CreatedAt); err != nil {
			return nil, err
		}

		out = append(out, r)
	}

	return out, rows.Err()
}

// Trade returns who traded in a transaction, and false when it does not exist.
func (s *Store) Trade(ctx context.Context, transactionID string) (Trade, bool, error) {
	var t Trade

	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT buyer_id, seller_id, type FROM transactions WHERE status='complete' AND id = $1`,
		transactionID).Scan(&t.BuyerID, &t.SellerID, &t.Type)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, false, nil
	}

	return t, err == nil, err
}

// Insert writes a review. A second review of one transaction is a unique
// violation, which the caller turns into a conflict.
func (s *Store) Insert(
	ctx context.Context,
	id, transactionID, sellerID, buyerID string,
	rating int,
	comment string,
) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO store_reviews (id, seller_id, buyer_id, transaction_id, rating, comment)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))`,
		id, sellerID, buyerID, transactionID, rating, comment)

	return err
}

// Delete removes a review. It reports false when there was none.
func (s *Store) Delete(ctx context.Context, id string) (bool, error) {
	tag, err := s.db.Q(ctx).Exec(ctx, `DELETE FROM store_reviews WHERE id = $1`, id)

	return tag.RowsAffected() > 0, err
}
