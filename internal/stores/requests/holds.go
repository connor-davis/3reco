package requests

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// ReleaseHolds frees all reservations for a locked request.
func (s *Store) ReleaseHolds(ctx context.Context, requestID string) error {
	_, err := s.db.Q(ctx).Exec(
		ctx,
		`
		UPDATE stock_holds SET status='released', released_at=clock_timestamp()
		WHERE request_id=$1 AND status='active'`,
		requestID,
	)

	return err
}

// ReserveHold locks the requested stock before checking availability in a fresh statement.
// Call in material and stock ID order, inside the offer transaction.
func (s *Store) ReserveHold(
	ctx context.Context,
	r Request,
	material, weight string,
	lifetime time.Duration,
) (bool, error) {
	var stockID string
	err := s.db.Q(ctx).QueryRow(
		ctx,
		`
		SELECT s.id FROM stock s JOIN transaction_request_items i ON i.request_id=$1
		AND i.material_id=s.material_id
		WHERE s.owner_id=$2 AND s.material_id=$3
		AND (i.stock_id=s.id OR (i.stock_id IS NULL AND s.id=(
			SELECT id FROM stock WHERE owner_id=$2 AND material_id=$3 ORDER BY id LIMIT 1)))
		ORDER BY s.id LIMIT 1 FOR UPDATE OF s`,
		r.ID,
		r.Seller.ID,
		material,
	).Scan(&stockID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}

	if err != nil {
		return false, err
	}

	tag, err := s.db.Q(ctx).Exec(
		ctx,
		`
		INSERT INTO stock_holds
		(id, request_id, request_item_position, stock_id, seller_id, buyer_id, weight, expires_at)
		SELECT $1, i.request_id, i.position, s.id, $3, $4, $5::numeric,
			clock_timestamp()+$6::double precision * interval '1 second'
		FROM transaction_request_items i JOIN stock s ON s.id=$7
		WHERE i.request_id=$2 AND i.material_id=$8 AND s.is_listed
		AND stock_available(s.id,s.weight)>=$5::numeric`,
		database.NewID(),
		r.ID,
		r.Seller.ID,
		r.Buyer.ID,
		weight,
		lifetime.Seconds(),
		stockID,
		material,
	)

	return tag.RowsAffected() == 1, err
}

// ExpireOffers locks a bounded batch of requests, skipping requests another worker owns.
// Its caller keeps this transaction open through both parties' notifications.
func (s *Store) ExpireOffers(ctx context.Context) ([]Request, error) {
	candidates, err := s.db.Q(ctx).Query(ctx, `
		SELECT r.id FROM transaction_requests r
		WHERE r.status IN ('pending','offered') AND EXISTS (
			SELECT 1 FROM stock_holds h WHERE h.request_id=r.id
			AND h.status='active' AND h.expires_at<=clock_timestamp())
		ORDER BY r.id LIMIT 100 FOR UPDATE OF r SKIP LOCKED`)
	if err != nil {
		return nil, err
	}

	var ids []string
	for candidates.Next() {
		var id string
		if err := candidates.Scan(&id); err != nil {
			candidates.Close()

			return nil, err
		}

		ids = append(ids, id)
	}

	candidates.Close()
	if err := candidates.Err(); err != nil {
		return nil, err
	}

	if len(ids) == 0 {
		return nil, nil
	}

	// Recheck with a fresh statement snapshot after taking the request locks.
	// An offer refreshed just before its lock was acquired must not be expired.
	rows, err := s.db.Q(ctx).Query(
		ctx,
		`
		WITH expired AS MATERIALIZED (
			SELECT r.id FROM transaction_requests r
			WHERE r.id=ANY($1) AND r.status IN ('pending','offered') AND EXISTS (
				SELECT 1 FROM stock_holds h WHERE h.request_id=r.id
				AND h.status='active' AND h.expires_at<=clock_timestamp())
		), released AS (
			UPDATE stock_holds SET status='released', released_at=clock_timestamp()
			WHERE request_id IN (SELECT id FROM expired) AND status='active'
		), cancelled AS (
			UPDATE transactions SET status='cancelled'
			WHERE request_id IN (SELECT id FROM expired) AND status='pending'
		), cleared AS (
			UPDATE transaction_request_items SET offer_weight=NULL, offer_price=NULL
			WHERE request_id IN (SELECT id FROM expired)
		)
		UPDATE transaction_requests SET status='pending', offer_by=NULL, buyer_confirmed_version=NULL, seller_confirmed_version=NULL, updated_at=clock_timestamp()
		WHERE id IN (SELECT id FROM expired) RETURNING id, seller_id, buyer_id`,
		ids,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var expired []Request
	for rows.Next() {
		var r Request
		if err := rows.Scan(&r.ID, &r.Seller.ID, &r.Buyer.ID); err != nil {
			return nil, err
		}

		expired = append(expired, r)
	}

	return expired, rows.Err()
}
