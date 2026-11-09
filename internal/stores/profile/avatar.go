package profile

import "context"

// AvatarKey reads the private object reference, optionally locking for replacement.
func (records *Store) AvatarKey(ctx context.Context, id string, lock bool) (string, error) {
	query := `SELECT COALESCE(avatar_key,'') FROM users WHERE id=$1 AND NOT is_removed`
	if lock {
		query += ` FOR UPDATE`
	}

	var key string
	err := records.db.Q(ctx).QueryRow(ctx, query, id).Scan(&key)

	return key, err
}

// SetAvatar changes only the caller's uploaded avatar reference.
func (records *Store) SetAvatar(ctx context.Context, id, key string) error {
	_, err := records.db.Q(ctx).Exec(ctx,
		`UPDATE users SET avatar_key=NULLIF($2,''),updated_at=now() WHERE id=$1`, id, key)

	return err
}
