// Package stores owns public business-store and review SQL.
package stores

import "github.com/connor-davis/3reco/internal/platform/database"

// Store runs store directory SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }
