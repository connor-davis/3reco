// Package market owns safe public listing SQL and buyer-scoped carts.
package market

import "github.com/connor-davis/3reco/internal/platform/database"

// Store runs marketplace SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }
