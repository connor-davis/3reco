// Package savedsearches owns the SQL for a person's material and price alerts.
package savedsearches

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Search is a saved material and inclusive price range. Empty bounds are unlimited.
type Search struct {
	ID           string    `json:"id"`
	MaterialID   string    `json:"material_id"`
	MaterialName string    `json:"material_name"`
	MinPrice     string    `json:"min_price"`
	MaxPrice     string    `json:"max_price"`
	CreatedAt    time.Time `json:"created_at"`
}

// Store runs caller-scoped saved search SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Create saves a search only if the material exists, returning whether it was found.
func (s *Store) Create(ctx context.Context, userID string, search Search) (bool, error) {
	result, err := s.db.Q(ctx).Exec(
		ctx,
		`
		INSERT INTO saved_searches (id,user_id,material_id,min_price,max_price)
		SELECT $1,$2,id,NULLIF($4,'')::numeric,NULLIF($5,'')::numeric
		FROM materials WHERE id=$3`,
		search.ID,
		userID,
		search.MaterialID,
		search.MinPrice,
		search.MaxPrice,
	)

	return result.RowsAffected() == 1, err
}

// List returns only the named person's searches, newest first.
func (s *Store) List(ctx context.Context, userID string) ([]Search, error) {
	rows, err := s.db.Q(ctx).Query(
		ctx,
		`
		SELECT s.id,s.material_id,m.name,COALESCE(s.min_price::text,''),
			COALESCE(s.max_price::text,''),s.created_at
		FROM saved_searches s JOIN materials m ON m.id=s.material_id
		WHERE s.user_id=$1 ORDER BY s.created_at DESC,s.id DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Search{}
	for rows.Next() {
		var search Search
		err := rows.Scan(
			&search.ID,
			&search.MaterialID,
			&search.MaterialName,
			&search.MinPrice,
			&search.MaxPrice,
			&search.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		items = append(items, search)
	}

	return items, rows.Err()
}

// Delete removes only the person's own row. Missing and other people's ids are harmless.
func (s *Store) Delete(ctx context.Context, userID, id string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `DELETE FROM saved_searches WHERE user_id=$1 AND id=$2`, userID, id)

	return err
}
