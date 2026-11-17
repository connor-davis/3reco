// Package demo holds the few statements the demo site needs: count users,
// verify the dummy businesses and wipe the database for the nightly reset.
package demo

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Store runs the demo statements.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// UserCount is how many people exist. The seed only runs on none.
func (s *Store) UserCount(ctx context.Context) (int, error) {
	var count int

	err := s.db.Pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&count)

	return count, err
}

// VerifyBusinesses marks every business as checked by 3REco. No route does
// this (an admin does it by hand), and unverified businesses are hidden from
// the market.
func (s *Store) VerifyBusinesses(ctx context.Context) error {
	_, err := s.db.Pool.Exec(ctx, `
		UPDATE businesses SET business_verified_at = now() WHERE business_verified_at IS NULL`)

	return err
}

// ResetSchema drops every table and makes an empty public schema, so the
// migrations can run again from nothing. It also clears schema_migrations.
func (s *Store) ResetSchema(ctx context.Context) error {
	_, err := s.db.Pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`)

	return err
}

// Counts reads the headline row counts, for the seed report and its tests.
func (s *Store) Counts(ctx context.Context) (map[string]int, error) {
	out := map[string]int{}

	for table, sql := range map[string]string{
		"users":        `SELECT count(*) FROM users`,
		"businesses":   `SELECT count(*) FROM businesses`,
		"materials":    `SELECT count(*) FROM materials`,
		"stock":        `SELECT count(*) FROM stock`,
		"requests":     `SELECT count(*) FROM transaction_requests`,
		"transactions": `SELECT count(*) FROM transactions`,
		"collectors":   `SELECT count(*) FROM collectors`,
		"reviews":      `SELECT count(*) FROM store_reviews`,
		"wanted":       `SELECT count(*) FROM wanted_posts`,
		"quick":        `SELECT count(*) FROM quick_replies`,
	} {
		var count int

		if err := s.db.Pool.QueryRow(ctx, sql).Scan(&count); err != nil {
			return nil, err
		}

		out[table] = count
	}

	return out, nil
}
