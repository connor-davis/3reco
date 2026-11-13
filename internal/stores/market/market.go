// Package market owns safe public listing SQL and buyer-scoped carts.
package market

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Store runs marketplace SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Unverified reports whether the id is a business 3REco has not verified yet.
// Collectors, staff and admin are never unverified.
func (records *Store) Unverified(ctx context.Context, id string) (bool, error) {
	var unverified bool
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT EXISTS (SELECT 1 FROM businesses WHERE id=$1 AND business_verified_at IS NULL)`,
		id,
	).Scan(&unverified)

	return unverified, err
}
