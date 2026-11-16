// Package favourites is the SQL for saved listings and followed stores. Both
// belong to a person (a users id), never to a business.
package favourites

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// MaxIDs caps how many saved ids one call returns.
// ponytail: hearts read one id list, so a person with more than this many
// saves would see the oldest ones unmarked; page the list to go beyond it.
const MaxIDs = 1000

// Store runs the favourites and follows SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// AddFavourite saves a listing for a person. Saving twice changes nothing.
func (s *Store) AddFavourite(ctx context.Context, userID, stockID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO favourites (user_id, stock_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, userID, stockID)

	return err
}

// RemoveFavourite drops a listing from the person's saved list. It only ever
// touches that person's own row.
func (s *Store) RemoveFavourite(ctx context.Context, userID, stockID string) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`DELETE FROM favourites WHERE user_id = $1 AND stock_id = $2`, userID, stockID)

	return err
}

// FavouriteIDs lists the person's saved listing ids, newest save first.
func (s *Store) FavouriteIDs(ctx context.Context, userID string) ([]string, error) {
	return s.ids(ctx, `SELECT stock_id FROM favourites WHERE user_id = $1
		ORDER BY created_at DESC, stock_id DESC LIMIT $2`, userID)
}

// AddFollow follows a store for a person. Following twice changes nothing.
func (s *Store) AddFollow(ctx context.Context, userID, storeID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO follows (user_id, store_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, userID, storeID)

	return err
}

// RemoveFollow unfollows a store. Old alerts stay, and only the person's own
// row is touched.
func (s *Store) RemoveFollow(ctx context.Context, userID, storeID string) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`DELETE FROM follows WHERE user_id = $1 AND store_id = $2`, userID, storeID)

	return err
}

// FollowIDs lists the person's followed store ids, newest follow first.
func (s *Store) FollowIDs(ctx context.Context, userID string) ([]string, error) {
	return s.ids(ctx, `SELECT store_id FROM follows WHERE user_id = $1
		ORDER BY created_at DESC, store_id DESC LIMIT $2`, userID)
}

func (s *Store) ids(ctx context.Context, query, userID string) ([]string, error) {
	rows, err := s.db.Q(ctx).Query(ctx, query, userID, MaxIDs)
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
