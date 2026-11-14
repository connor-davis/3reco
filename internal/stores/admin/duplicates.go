package admin

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// DuplicateGroup is a live candidate set, oldest trade first.
type DuplicateGroup struct {
	Kind string   `json:"kind"`
	IDs  []string `json:"ids"`
}

// Item signatures keep numeric JSON values, so 4 and 4.00 compare equally.
// Sorting retains repeated lines while ignoring the order they were entered.
const duplicateSignatures = `WITH signatures AS (
	SELECT t.id, t.buyer_id, t.seller_id, t.type, t.total_price, t.created_at,
		COALESCE(t.collection_day,
			(t.created_at AT TIME ZONE 'Africa/Johannesburg')::date) AS day,
		COALESCE((SELECT jsonb_agg(jsonb_build_array(i.material_id, i.weight, i.price)
			ORDER BY i.material_id, i.weight, i.price)
			FROM transaction_items i WHERE i.transaction_id=t.id), '[]'::jsonb) AS items
	FROM transactions t WHERE t.status='complete'
) `

// DuplicateGroups finds exact sets and same-total sets whose items differ.
func (s *Store) DuplicateGroups(ctx context.Context) ([]DuplicateGroup, error) {
	rows, err := s.db.Q(ctx).Query(ctx, duplicateSignatures+`, candidates AS (
		SELECT 'exact' AS kind, array_agg(id ORDER BY created_at,id) AS ids,
			array_agg(id ORDER BY id) AS sorted_ids
		FROM signatures GROUP BY buyer_id,seller_id,type,day,items HAVING count(*) > 1
		UNION ALL
		SELECT 'possible', array_agg(id ORDER BY created_at,id), array_agg(id ORDER BY id)
		FROM signatures GROUP BY buyer_id,seller_id,day,total_price
		HAVING count(DISTINCT items) > 1
	)
	SELECT kind,ids FROM candidates c WHERE NOT EXISTS (
		SELECT 1 FROM duplicate_dismissals d WHERE d.trade_ids=c.sorted_ids)
	ORDER BY kind,ids`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []DuplicateGroup{}
	for rows.Next() {
		var group DuplicateGroup
		if err := rows.Scan(&group.Kind, &group.IDs); err != nil {
			return nil, err
		}

		out = append(out, group)
	}

	return out, rows.Err()
}

// MarkedDuplicates lists retained copies for the admin's undo list.
func (s *Store) MarkedDuplicates(ctx context.Context) ([]string, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT id FROM transactions
		WHERE status='duplicate' ORDER BY duplicate_marked_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		out = append(out, id)
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

// ExactDuplicate verifies both complete trades still have the same numeric multiset.
func (s *Store) ExactDuplicate(ctx context.Context, id, original string) (bool, error) {
	var matches bool
	err := s.db.Q(ctx).QueryRow(ctx, duplicateSignatures+`SELECT EXISTS (
		SELECT 1 FROM signatures a JOIN signatures b ON a.buyer_id=b.buyer_id
		AND a.seller_id=b.seller_id AND a.type=b.type AND a.day=b.day AND a.items=b.items
		WHERE a.id=$1 AND b.id=$2 AND a.id<>b.id)`, id, original).Scan(&matches)

	return matches, err
}

// HasDuplicateCopies prevents an original from becoming a copy and creating a chain.
func (s *Store) HasDuplicateCopies(ctx context.Context, id string) (bool, error) {
	var found bool
	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM transactions WHERE duplicate_of=$1)`, id).Scan(&found)

	return found, err
}

// SetDuplicate marks a copy or restores it without changing its financial records.
func (s *Store) SetDuplicate(ctx context.Context, id, original, actor string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE transactions SET
		status=CASE WHEN $2='' THEN 'complete' ELSE 'duplicate' END,
		duplicate_of=NULLIF($2,''), duplicate_marked_by=CASE WHEN $2<>'' THEN $3 END,
		duplicate_marked_at=CASE WHEN $2<>'' THEN now() END WHERE id=$1`, id, original, actor)

	return err
}

// DismissDuplicates remembers precisely this sorted group, not future copies.
func (s *Store) DismissDuplicates(ctx context.Context, ids []string, actor string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `INSERT INTO duplicate_dismissals(id,trade_ids,actor_id)
		VALUES($1,$2,$3) ON CONFLICT(trade_ids) DO NOTHING`, database.NewID(), ids, actor)

	return err
}
