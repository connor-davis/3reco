package transactions

import "context"

// Available reads free stock after the caller has acquired the stock row lock.
func (s *Store) Available(ctx context.Context, stockID string) (string, error) {
	var available string
	err := s.db.Q(ctx).QueryRow(
		ctx,
		`SELECT stock_available(id,weight)::text FROM stock WHERE id=$1`,
		stockID,
	).Scan(&available)

	return available, err
}

// ConsumeHold fences an acceptance against expiry. Stock and request must already be locked.
func (s *Store) ConsumeHold(ctx context.Context, requestID, stockID, weight string) (bool, error) {
	tag, err := s.db.Q(ctx).Exec(
		ctx,
		`
		UPDATE stock_holds SET status='consumed', consumed_at=clock_timestamp()
		WHERE request_id=$1 AND stock_id=$2 AND weight=$3::numeric
		AND status='active' AND expires_at>clock_timestamp()`,
		requestID,
		stockID,
		weight,
	)

	return tag.RowsAffected() == 1, err
}
