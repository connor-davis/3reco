package transactions

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// NewTransaction is what Insert needs to write one transaction row.
type NewTransaction struct {
	ID             string
	SellerID       string
	BuyerID        string
	Type           string
	CollectionDay  *string
	CollectionDate *time.Time
}

// Insert writes a transaction with a zero total; SetTotal fills it in once the
// items are written, so the total always comes from the stored rows.
func (s *Store) Insert(ctx context.Context, n NewTransaction) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO transactions
			(id, seller_id, buyer_id, type, total_price, collection_day, collection_date)
		VALUES ($1, $2, $3, $4, 0, $5::date, $6)`,
		n.ID, n.SellerID, n.BuyerID, n.Type, n.CollectionDay, n.CollectionDate)

	return err
}

// InsertItem writes one line of a transaction.
func (s *Store) InsertItem(
	ctx context.Context,
	transactionID string,
	position int,
	materialID, weight, price string,
) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO transaction_items (transaction_id, position, material_id, weight, price)
		VALUES ($1, $2, $3, $4::numeric, $5::numeric)`,
		transactionID, position, materialID, weight, price)

	return err
}

// SetTotal sets the total price to the sum of weight times price over the
// stored items, in exact decimals.
func (s *Store) SetTotal(ctx context.Context, transactionID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE transactions SET total_price = (
			SELECT COALESCE(SUM(weight * price), 0) FROM transaction_items WHERE transaction_id = $1)
		WHERE id = $1`, transactionID)

	return err
}

// SnapshotCollector freezes the collector's details on a c2b transaction, for
// the invoice. It is never sent to a browser.
func (s *Store) SnapshotCollector(ctx context.Context, transactionID, collectorID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE transactions SET collector_snapshot = (
			SELECT to_jsonb(c) - 'id' - 'created_by_user_id' - 'created_by_business_id'
			FROM collectors c WHERE c.id = $2)
		WHERE id = $1`, transactionID, collectorID)

	return err
}

// MaterialPrice returns a material's base price, and false when no such
// material exists.
func (s *Store) MaterialPrice(ctx context.Context, materialID string) (string, bool, error) {
	var price string

	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT price::text FROM materials WHERE id = $1`, materialID).Scan(&price)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}

	return price, err == nil, err
}

// LockStock locks a seller's stock row for one material until the transaction
// ends, so two sales cannot both spend the same kilos. It returns the row id
// and weight, and false when the seller has none.
func (s *Store) LockStock(ctx context.Context, ownerID, materialID string) (string, string, bool, error) {
	var id, weight string

	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT id, weight::text FROM stock WHERE owner_id = $1 AND material_id = $2
		ORDER BY id LIMIT 1 FOR UPDATE`, ownerID, materialID).Scan(&id, &weight)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", false, nil
	}

	return id, weight, err == nil, err
}

// Take removes weight from a locked stock row. A row that reaches exactly
// zero is unlisted, because nothing is left to sell. It reports false when
// the row holds less than weight.
func (s *Store) Take(ctx context.Context, stockID, weight string) (bool, error) {
	tag, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE stock SET weight = weight - $2::numeric,
			is_listed = CASE WHEN weight - $2::numeric = 0 THEN false ELSE is_listed END,
			updated_at = now()
		WHERE id = $1 AND weight >= $2::numeric`, stockID, weight)

	return tag.RowsAffected() > 0, err
}

// Give adds weight to the owner's stock of a material, at the price paid, or
// starts an unlisted row. The advisory lock keeps two sales to the same buyer
// from each starting a row.
func (s *Store) Give(ctx context.Context, ownerID, materialID, weight, price, newID string) error {
	q := s.db.Q(ctx)

	_, err := q.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`, ownerID, materialID)
	if err != nil {
		return err
	}

	tag, err := q.Exec(ctx, `
		UPDATE stock SET weight = weight + $3::numeric, price = $4::numeric, updated_at = now()
		WHERE id = (SELECT id FROM stock WHERE owner_id = $1 AND material_id = $2
			ORDER BY id LIMIT 1)`, ownerID, materialID, weight, price)
	if err != nil || tag.RowsAffected() > 0 {
		return err
	}

	_, err = q.Exec(ctx, `
		INSERT INTO stock (id, owner_id, material_id, weight, price, is_listed)
		VALUES ($1, $2, $3, $4::numeric, $5::numeric, false)`,
		newID, ownerID, materialID, weight, price)

	return err
}

// ActiveBusiness reports whether the id belongs to a business that was not removed.
func (s *Store) ActiveBusiness(ctx context.Context, userID string) (bool, error) {
	var ok bool

	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM users
			WHERE id = $1 AND role = 'business' AND NOT is_removed)`, userID).Scan(&ok)

	return ok, err
}

// CollectorExists reports whether a collector row has this id.
func (s *Store) CollectorExists(ctx context.Context, collectorID string) (bool, error) {
	var ok bool

	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM collectors WHERE id = $1)`, collectorID).Scan(&ok)

	return ok, err
}

// CollectorForUser finds the collector row linked to a collector-role user.
// The link is the phone number, the only thing the two share. It returns
// false when the user has no linked collector row.
func (s *Store) CollectorForUser(ctx context.Context, userID string) (string, bool, error) {
	var id string

	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT c.id FROM collectors c JOIN users u ON u.normalized_phone = c.normalized_phone
		WHERE u.id = $1 AND u.normalized_phone IS NOT NULL
		ORDER BY c.id LIMIT 1`, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}

	return id, err == nil, err
}
