package requests

import "context"

// ResetConfirmation cancels the retained pending trade before replacing its terms.
// The caller holds the request lock throughout the change.
func (s *Store) ResetConfirmation(ctx context.Context, id string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE transactions SET status='cancelled'
		WHERE request_id=$1 AND status='pending'`, id)
	if err != nil {
		return err
	}

	_, err = s.db.Q(ctx).Exec(ctx, `UPDATE transaction_requests SET
		offer_by=NULL, buyer_confirmed_version=NULL, seller_confirmed_version=NULL WHERE id=$1`, id)

	return err
}

// StartOffer records the author and advances the version under the request lock.
func (s *Store) StartOffer(ctx context.Context, id, author string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE transaction_requests SET status='offered',
		offer_by=$2, offer_version=offer_version+1, updated_at=clock_timestamp() WHERE id=$1`, id, author)

	return err
}

// Confirm records the caller's confirmation of the current locked version.
func (s *Store) Confirm(ctx context.Context, r Request, userID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE transaction_requests SET
		buyer_confirmed_version=CASE WHEN buyer_id=$2 THEN offer_version ELSE buyer_confirmed_version END,
		seller_confirmed_version=CASE WHEN seller_id=$2 THEN offer_version ELSE seller_confirmed_version END,
		updated_at=clock_timestamp() WHERE id=$1`, r.ID, userID)

	return err
}

// LiveHolds fences the first confirmation against expired or missing reservations.
func (s *Store) LiveHolds(ctx context.Context, id string, count int) (bool, error) {
	var live bool
	err := s.db.Q(ctx).QueryRow(ctx, `SELECT count(*)=$2 FROM stock_holds
		WHERE request_id=$1 AND status='active' AND expires_at>clock_timestamp()`, id, count).Scan(&live)

	return live, err
}
