package admin

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// LinkedPairs finds every pair of complete trades with the same buyer, seller
// and type that share at least one identical line (material, weight and price
// as numbers), at any date. The service joins the pairs into groups.
func (s *Store) LinkedPairs(ctx context.Context) ([][2]string, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT DISTINCT a.transaction_id, b.transaction_id
		FROM transaction_items a
		JOIN transaction_items b ON `+database.SameLine("a", "b")+` AND a.transaction_id < b.transaction_id
		JOIN transactions ta ON ta.id=a.transaction_id AND ta.status='complete'
		JOIN transactions tb ON tb.id=b.transaction_id AND tb.status='complete'
		WHERE ta.buyer_id=tb.buyer_id AND ta.seller_id=tb.seller_id AND ta.type=tb.type`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := [][2]string{}
	for rows.Next() {
		var pair [2]string
		if err := rows.Scan(&pair[0], &pair[1]); err != nil {
			return nil, err
		}

		out = append(out, pair)
	}

	return out, rows.Err()
}

// Dismissed lists the sorted trade ids of every group an admin dismissed.
func (s *Store) Dismissed(ctx context.Context) ([][]string, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT trade_ids FROM duplicate_dismissals`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := [][]string{}
	for rows.Next() {
		var ids []string
		if err := rows.Scan(&ids); err != nil {
			return nil, err
		}

		out = append(out, ids)
	}

	return out, rows.Err()
}

// LockDuplicateTrades locks all named trades in a stable order before a decision.
func (s *Store) LockDuplicateTrades(ctx context.Context, ids []string) error {
	rows, err := s.db.Q(ctx).Query(ctx,
		`SELECT id FROM transactions WHERE id=ANY($1) ORDER BY id FOR UPDATE`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		// Exhaust the result so every row is locked before the caller reads it.
	}

	return rows.Err()
}

// HasDuplicateCopies is true when trades marked as copies by the earlier
// Undo-able flow still point at this one.
func (s *Store) HasDuplicateCopies(ctx context.Context, id string) (bool, error) {
	var found bool
	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM transactions WHERE duplicate_of=$1)`, id).Scan(&found)

	return found, err
}

// HasReview is true when someone left a review on the trade.
func (s *Store) HasReview(ctx context.Context, id string) (bool, error) {
	var found bool
	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM store_reviews WHERE transaction_id=$1)`, id).Scan(&found)

	return found, err
}

// DeleteCopy writes one audit snapshot of the copy, then deletes it for good:
// its key reservation, receipts and items go with it. It returns the object
// keys to remove from storage once the transaction commits. The delete guard
// is lifted only inside this transaction (migration 0031).
func (s *Store) DeleteCopy(
	ctx context.Context,
	actor, id, original string,
	stock map[string]string,
) ([]string, error) {
	var invoiceKey string
	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT COALESCE(invoice_key,'') FROM transactions WHERE id=$1`, id).Scan(&invoiceKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	keys := []string{}
	if invoiceKey != "" {
		keys = append(keys, invoiceKey)
	}

	rows, err := s.db.Q(ctx).Query(ctx,
		`SELECT object_key FROM transaction_receipts WHERE transaction_id=$1 ORDER BY id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}

		keys = append(keys, key)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows.Close()

	// The row audit lines mask object keys, so this snapshot is the one place
	// that records the files, the original and the stock taken.
	_, err = s.db.Q(ctx).Exec(ctx, `INSERT INTO audit_log
		(actor_id, table_name, row_key, action, old_values)
		SELECT NULLIF($1,''), 'duplicate_copy_deleted', jsonb_build_object('id', t.id), 'delete',
			jsonb_build_object('transaction', to_jsonb(t) - 'invoice_key' - 'collector_snapshot',
				'original_id', $3::text, 'stock_taken', $4::jsonb, 'file_keys', to_jsonb($5::text[]),
				'items', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.position)
					FROM transaction_items i WHERE i.transaction_id=t.id), '[]'::jsonb))
		FROM transactions t WHERE t.id=$2`, actor, id, original, stock, keys)
	if err != nil {
		return nil, err
	}

	if _, err := s.db.Q(ctx).Exec(ctx,
		`SELECT set_config('threereco.allow_duplicate_delete', 'on', true)`); err != nil {
		return nil, err
	}

	if _, err := s.db.Q(ctx).Exec(ctx,
		`DELETE FROM collection_idempotency WHERE transaction_id=$1`, id); err != nil {
		return nil, err
	}

	if _, err := s.db.Q(ctx).Exec(ctx, `DELETE FROM transactions WHERE id=$1`, id); err != nil {
		return nil, err
	}

	return keys, nil
}

// DismissDuplicates remembers precisely this sorted group, not future copies.
func (s *Store) DismissDuplicates(ctx context.Context, ids []string, actor string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `INSERT INTO duplicate_dismissals(id,trade_ids,actor_id)
		VALUES($1,$2,$3) ON CONFLICT(trade_ids) DO NOTHING`, database.NewID(), ids, actor)

	return err
}
