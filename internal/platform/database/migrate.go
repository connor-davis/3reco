package database

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// advisoryKey is the Postgres lock that stops two servers migrating at once.
const advisoryKey = 3_000_001

// Migrate applies every embedded SQL file that has not run yet, in file-name
// order. Each file runs in its own transaction. A file whose contents changed
// after it ran stops the server: merged migrations are never rewritten.
func Migrate(ctx context.Context, db *DB) error {
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return err
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}

	sort.Strings(names)

	// One connection holds the lock for the whole run.
	conn, err := db.Pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", advisoryKey); err != nil {
		return err
	}
	defer func() {
		_, _ = conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock($1)", advisoryKey)
	}()

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name text PRIMARY KEY,
		checksum text NOT NULL,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		return err
	}

	for _, name := range names {
		body, err := migrationFiles.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}

		// Windows checkouts may turn LF into CRLF; the hash must not care.
		clean := strings.ReplaceAll(string(body), "\r\n", "\n")
		sum := sha256.Sum256([]byte(clean))
		checksum := hex.EncodeToString(sum[:])

		var applied string

		err = conn.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE name = $1", name).
			Scan(&applied)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		if err == nil {
			if applied != checksum {
				return fmt.Errorf("migration %s changed after it ran; restore the merged file", name)
			}

			continue
		}

		tx, err := conn.Begin(ctx)
		if err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, clean); err != nil {
			_ = tx.Rollback(ctx)

			return fmt.Errorf("migration %s rolled back: %w", name, err)
		}

		if _, err := tx.Exec(
			ctx,
			"INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
			name,
			checksum,
		); err != nil {
			_ = tx.Rollback(ctx)

			return err
		}

		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}

	return nil
}
