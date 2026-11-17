// Package geocode owns the persistent address lookup cache.
package geocode

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Store reads and writes cached address results.
type Store struct{ db *database.DB }

// New builds the cache store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Result is a successful point or a dated unsuccessful lookup.
type Result struct {
	Lat, Lng   *float64
	Found      bool
	LookedUpAt time.Time
}

// Get reads a normalized query; a missing row returns pgx.ErrNoRows.
func (store *Store) Get(ctx context.Context, query string) (Result, error) {
	var result Result
	err := store.db.Q(ctx).QueryRow(ctx, `SELECT latitude::float8,longitude::float8,found,looked_up_at
		FROM geocode_cache WHERE query=$1`, query).Scan(
		&result.Lat, &result.Lng, &result.Found, &result.LookedUpAt)

	return result, err
}

// Put saves both successes and failures, resetting the failure retry date.
func (store *Store) Put(ctx context.Context, query string, lat, lng *float64, found bool) error {
	_, err := store.db.Q(ctx).Exec(ctx, `INSERT INTO geocode_cache(query,latitude,longitude,found)
		VALUES($1,$2,$3,$4) ON CONFLICT(query) DO UPDATE SET latitude=$2,longitude=$3,
		found=$4,looked_up_at=now()`, query, lat, lng, found)

	return err
}
