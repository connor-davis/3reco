package stock

import "context"

// ImageKey reads only an owner's photo or a lot currently visible in the market.
func (records *Store) ImageKey(ctx context.Context, id, caller string) (string, error) {
	var key string
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT s.image_key FROM stock s JOIN business_profiles u ON u.id=s.owner_id
		WHERE s.id=$1 AND s.image_key IS NOT NULL AND
		(s.owner_id=$2 OR (s.is_listed AND s.weight>0 AND u.role='business' AND NOT u.is_removed))`,
		id,
		caller,
	).Scan(&key)

	return key, err
}

// SetImage replaces the photo reference of an already locked owner row.
func (records *Store) SetImage(ctx context.Context, id, owner, key string) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`UPDATE stock SET image_key=NULLIF($3,''),updated_at=now() WHERE id=$1 AND owner_id=$2`,
		id,
		owner,
		key,
	)

	return err
}
