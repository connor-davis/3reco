package transactions

import "context"

// PendingID returns the retained trade for the locked request's current offer.
func (s *Store) PendingID(ctx context.Context, requestID string, version int) (string, error) {
	var id string
	err := s.db.Q(ctx).QueryRow(ctx, `SELECT id FROM transactions
		WHERE request_id=$1 AND offer_version=$2 AND status='pending' FOR UPDATE`, requestID, version).Scan(&id)

	return id, err
}

// Complete marks a pending trade complete in the same transaction as its stock movement.
func (s *Store) Complete(ctx context.Context, id string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE transactions SET status='complete' WHERE id=$1 AND status='pending'`, id)

	return err
}
