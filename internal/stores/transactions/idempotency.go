package transactions

import "context"

// CollectionKey reserves a caller's key under the unique index. Concurrent
// inserts wait for the first transaction, then return its saved result.
// It must run in the transaction that creates and saves the collection.
func (s *Store) CollectionKey(ctx context.Context, user, key string) (string, error) {
	_, err := s.db.Q(ctx).Exec(ctx, `DELETE FROM collection_idempotency
		WHERE user_id=$1 AND key=$2 AND expires_at<=now()`, user, key)
	if err != nil {
		return "", err
	}

	_, err = s.db.Q(ctx).Exec(ctx, `INSERT INTO collection_idempotency(user_id,key)
		VALUES($1,$2) ON CONFLICT DO NOTHING`, user, key)
	if err != nil {
		return "", err
	}

	var id string
	err = s.db.Q(ctx).QueryRow(ctx, `SELECT COALESCE(transaction_id,'')
		FROM collection_idempotency WHERE user_id=$1 AND key=$2 FOR UPDATE`, user, key).Scan(&id)

	return id, err
}

// SaveCollectionKey binds the result before the collection transaction commits.
func (s *Store) SaveCollectionKey(ctx context.Context, user, key, id string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE collection_idempotency SET transaction_id=$3
		WHERE user_id=$1 AND key=$2`, user, key, id)

	return err
}
