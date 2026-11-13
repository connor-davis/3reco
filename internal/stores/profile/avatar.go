package profile

import "context"

// AvatarKey reads the private object reference, optionally locking for replacement.
func (records *Store) AvatarKey(ctx context.Context, id string, lock bool, business ...bool) (string, error) {
	query := `SELECT COALESCE(avatar_key,'') FROM users WHERE id=$1 AND NOT is_removed`
	if len(business) > 0 && business[0] {
		query = `SELECT COALESCE(avatar_key,'') FROM businesses WHERE id=$1`
		if !lock {
			query += ` AND NOT is_removed`
		}
	}

	if lock {
		query += ` FOR UPDATE`
	}

	var key string
	err := records.db.Q(ctx).QueryRow(ctx, query, id).Scan(&key)

	return key, err
}

// SetAvatar changes only the caller's uploaded avatar reference.
func (records *Store) SetAvatar(ctx context.Context, id, key string, business ...bool) error {
	table := "users"
	if len(business) > 0 && business[0] {
		table = "businesses"
	}

	_, err := records.db.Q(ctx).Exec(ctx,
		`UPDATE `+table+` SET avatar_key=NULLIF($2,''),updated_at=now() WHERE id=$1`, id, key)

	return err
}

// AvatarReferenced protects a migrated image shared by a person and a store.
func (records *Store) AvatarReferenced(ctx context.Context, key string) (bool, error) {
	var used bool
	err := records.db.Q(ctx).QueryRow(ctx, `SELECT
		EXISTS(SELECT 1 FROM users WHERE avatar_key=$1) OR
		EXISTS(SELECT 1 FROM businesses WHERE avatar_key=$1)`, key).Scan(&used)

	return used, err
}
