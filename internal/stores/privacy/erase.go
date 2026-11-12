package privacy

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Cancelled is an open request that was closed because one side was erased.
type Cancelled struct {
	RequestID string
	// OtherID is the person on the other side, who must be told.
	OtherID string
	// ErasedWasBuyer picks the page the notice links to.
	ErasedWasBuyer bool
}

// LockActive locks a user row that is not removed and reports whether there was one.
func (s *Store) LockActive(ctx context.Context, id string) (bool, error) {
	rows, err := s.db.Q(ctx).Query(ctx,
		`SELECT 1 FROM users WHERE id = $1 AND NOT is_removed FOR UPDATE`, id)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	found := rows.Next()

	return found, rows.Err()
}

// Trades lists the transactions a user took part in as buyer or business
// seller; their invoices name the user, so they must be rebuilt on removal.
func (s *Store) Trades(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT id FROM transactions
		WHERE status='complete' AND anonymised_at IS NULL AND (buyer_id = $1 OR (type = 'b2b' AND seller_id = $1))`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string

	for rows.Next() {
		var id string

		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		ids = append(ids, id)
	}

	return ids, rows.Err()
}

// CancelOpenRequests closes the user's pending and offered requests. Finished
// requests and their messages stay as history.
func (s *Store) CancelOpenRequests(ctx context.Context, userID string) ([]Cancelled, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		UPDATE transaction_requests SET status = 'cancelled', offer_by=NULL, buyer_confirmed_version=NULL, seller_confirmed_version=NULL, updated_at = now()
		WHERE (buyer_id = $1 OR seller_id = $1) AND status IN ('pending', 'offered')
		RETURNING id, CASE WHEN buyer_id = $1 THEN seller_id ELSE buyer_id END, buyer_id = $1`,
		userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Cancelled

	for rows.Next() {
		var c Cancelled

		if err := rows.Scan(&c.RequestID, &c.OtherID, &c.ErasedWasBuyer); err != nil {
			return nil, err
		}

		out = append(out, c)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows.Close()

	// A cancelled request must not keep the other side's stock reserved.
	ids := make([]string, len(out))
	for i, c := range out {
		ids[i] = c.RequestID
	}

	_, err = s.db.Q(ctx).Exec(ctx, `UPDATE transactions SET status='cancelled' WHERE request_id=ANY($1) AND status='pending'`, ids)
	if err != nil {
		return nil, err
	}

	_, err = s.db.Q(ctx).Exec(ctx, `
		UPDATE stock_holds SET status = 'released', released_at = clock_timestamp()
		WHERE request_id = ANY($1) AND status = 'active'`, ids)

	return out, err
}

// Erase removes what is private about a user and blanks the user row, keeping
// only the id so finished transactions and reviews still point at a row. It
// returns avatar and stock object keys for removal after commit. The caller
// runs it inside a transaction, after CancelOpenRequests.
func (s *Store) Erase(ctx context.Context, id, removedBy string) ([]string, error) {
	q := s.db.Q(ctx)

	var avatar *string
	if err := q.QueryRow(ctx, `SELECT avatar_key FROM users WHERE id = $1`, id).Scan(&avatar); err != nil {
		return nil, err
	}

	keys := []string{}
	if avatar != nil {
		keys = append(keys, *avatar)
	}

	// Read keys before deleting the stock rows that hold them.
	rows, err := q.Query(
		ctx,
		`SELECT COALESCE(image_key,'') FROM stock WHERE owner_id=$1 FOR UPDATE`,
		id,
	)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			rows.Close()
			return nil, err
		}
		if key != "" {
			keys = append(keys, key)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}

	// Order does not matter: each of these only points at the user.
	for _, stmt := range []string{
		`DELETE FROM sessions WHERE user_id = $1`,
		`DELETE FROM auth_tokens WHERE user_id = $1`,
		`DELETE FROM notifications WHERE user_id = $1`,
		`DELETE FROM carts WHERE buyer_id = $1 OR seller_id = $1`,
		`DELETE FROM stock WHERE owner_id = $1`,
		// Chat lines the app wrote for their actions ("X made an offer") keep
		// the event and lose only the name, so the other side can still follow
		// the trade. This runs before the user row is blanked below.
		`UPDATE transaction_request_messages m
			SET content = replace(m.content, n.name, 'Removed account')
			FROM (SELECT ` + database.DisplayName("u") + ` AS name FROM users u WHERE u.id = $1) n
			WHERE m.sender_id = $1 AND m.system`,
		// Free text they wrote. The conversation and the review stay.
		`UPDATE transaction_request_messages SET content = '[removed]' WHERE sender_id = $1 AND NOT system`,
		`UPDATE store_reviews SET comment = NULL WHERE buyer_id = $1`,
		// A business's own collector records go, unless an older trade has no
		// frozen copy of the collector and still needs the row for its invoice.
		// Collectors made by staff stay; created_by_user_id keeps pointing at
		// the blanked user row, which is never deleted.
		`DELETE FROM collectors c WHERE c.created_by_business_id = $1 AND NOT EXISTS (
			SELECT 1 FROM transactions t
			WHERE t.type = 'c2b' AND t.seller_id = c.id AND t.collector_snapshot IS NULL
				AND t.anonymised_at IS NULL)`,
	} {
		if _, err := q.Exec(ctx, stmt, id); err != nil {
			return nil, err
		}
	}

	_, err = q.Exec(ctx, `
		UPDATE users SET
			name = 'Removed account', business_name = 'Removed account',
			email = NULL, email_verified = false, email_verified_at = NULL,
			password_hash = NULL, image = NULL, avatar_key = NULL, phone = NULL,
			normalized_phone = NULL, role = 'guest', profile_complete = false,
			first_name = NULL, last_name = NULL,
			id_number = NULL, business_registration_number = NULL,
			bank_account_holder_name = NULL, bank_name = NULL, bank_account_number = NULL,
			bank_branch_code = NULL, bank_account_type = NULL, street_address = NULL,
			city = NULL, area_code = NULL, province = NULL,
			is_removed = true, removed_at = now(), removed_by = $2, updated_at = now()
		WHERE id = $1`, id, removedBy)
	if err != nil {
		return nil, err
	}

	return keys, nil
}
