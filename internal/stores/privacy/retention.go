package privacy

import "context"

// PurgeNotifications deletes notifications older than the given days.
func (s *Store) PurgeNotifications(ctx context.Context, days int) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`DELETE FROM notifications WHERE created_at < now() - make_interval(days => $1)`, days)

	return err
}

// PurgeCarts deletes carts nobody touched for the given days. Their items go with them.
func (s *Store) PurgeCarts(ctx context.Context, days int) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`DELETE FROM carts WHERE updated_at < now() - make_interval(days => $1)`, days)

	return err
}

// PurgeEvents deletes audit lines older than the given years.
func (s *Store) PurgeEvents(ctx context.Context, years int) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`DELETE FROM privacy_events WHERE created_at < now() - make_interval(years => $1)`, years)

	return err
}

// AnonymiseTrades removes the personal details of trades older than the given
// years: the frozen collector copy and the invoice. Amounts, materials and
// dates stay for statistics. It returns the invoice keys so the caller can
// remove the files. Trades already done are skipped, so it is safe to repeat.
func (s *Store) AnonymiseTrades(ctx context.Context, years int) ([]string, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		UPDATE transactions t
		SET collector_snapshot = NULL, invoice_key = NULL, anonymised_at = now()
		FROM (SELECT id, invoice_key FROM transactions
			WHERE status='complete' AND anonymised_at IS NULL AND created_at < now() - make_interval(years => $1)
			FOR UPDATE) old
		WHERE t.id = old.id
		RETURNING COALESCE(old.invoice_key, '')`, years)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []string

	for rows.Next() {
		var key string

		if err := rows.Scan(&key); err != nil {
			return nil, err
		}

		if key != "" {
			keys = append(keys, key)
		}
	}

	return keys, rows.Err()
}
