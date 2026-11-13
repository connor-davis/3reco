// Package database owns the Postgres pool, transactions and migrations.
package database

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Querier is what both the pool and a transaction can do, so a store runs
// the same SQL in or out of a transaction.
type Querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// DB wraps the pool. URL is kept because the realtime hub needs its own
// dedicated LISTEN connection.
type DB struct {
	Pool *pgxpool.Pool
	URL  string
}

// Connect opens the pool and checks that Postgres answers.
func Connect(ctx context.Context, url string, maxConns int) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("database url: %w", err)
	}

	if maxConns > 0 {
		cfg.MaxConns = int32(maxConns)
	}

	// A runaway query must not hold a pool slot for ever.
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "5min"
	cfg.ConnConfig.RuntimeParams["idle_in_transaction_session_timeout"] = "5min"
	cfg.ConnConfig.RuntimeParams["lock_timeout"] = "10s"

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()

		return nil, err
	}

	return &DB{Pool: pool, URL: url}, nil
}

// Close closes the pool.
func (d *DB) Close() { d.Pool.Close() }

type txKey struct{}

type actorKey struct{}

// WithActor says which user the writes made with ctx belong to. InTx hands it
// to Postgres, where the audit trigger reads it. Without one the audit line
// names the system.
func WithActor(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, actorKey{}, userID)
}

type txState struct {
	tx    pgx.Tx
	mu    sync.Mutex
	after []func()
}

// Q returns the transaction bound to ctx, or the pool when there is none.
func (d *DB) Q(ctx context.Context) Querier {
	if state, ok := ctx.Value(txKey{}).(*txState); ok {
		return state.tx
	}

	return d.Pool
}

// InTx runs fn inside one transaction. Every store call made with the ctx fn
// receives joins it. Nested calls join the outer transaction. Callbacks added
// with AfterCommit run once it commits.
func (d *DB) InTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(txKey{}).(*txState); ok {
		return fn(ctx)
	}

	tx, err := d.Pool.Begin(ctx)
	if err != nil {
		return err
	}

	state := &txState{tx: tx}

	// Transaction-local (true): Postgres clears it at commit or rollback.
	if actor, ok := ctx.Value(actorKey{}).(string); ok && actor != "" {
		if _, err := tx.Exec(ctx, `SELECT set_config('app.actor_id', $1, true)`, actor); err != nil {
			_ = tx.Rollback(context.WithoutCancel(ctx))

			return err
		}
	}

	if err := fn(context.WithValue(ctx, txKey{}, state)); err != nil {
		// A fresh context: the caller's may be what failed.
		_ = tx.Rollback(context.WithoutCancel(ctx))

		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	for _, fn := range state.after {
		fn()
	}

	return nil
}

// AfterCommit runs fn once the transaction in ctx commits, or at once when
// ctx has no transaction. A rolled-back transaction never runs it, so files
// are only deleted for rows that are really gone.
func AfterCommit(ctx context.Context, fn func()) {
	state, ok := ctx.Value(txKey{}).(*txState)
	if !ok {
		fn()

		return
	}

	state.mu.Lock()
	state.after = append(state.after, fn)
	state.mu.Unlock()
}

const idAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789"

// NewID returns a random lowercase id of 32 characters. Migrated rows keep
// their old Convex ids; every new row gets one of these.
func NewID() string {
	buf := make([]byte, 32)

	if _, err := rand.Read(buf); err != nil {
		// crypto/rand failing means the machine is broken; no id is safe.
		panic(err)
	}

	for i, b := range buf {
		// 256 is not a multiple of 36, so a tiny bias remains. It does not
		// matter for a 32-character id.
		buf[i] = idAlphabet[int(b)%len(idAlphabet)]
	}

	return string(buf)
}

// IsUnique reports whether err is a unique-constraint violation, and which
// constraint it was.
func IsUnique(err error) (constraint string, ok bool) {
	var pgErr *pgconn.PgError

	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return pgErr.ConstraintName, true
	}

	return "", false
}

// LogClose logs a close error that cannot be returned.
func LogClose(what string, err error) {
	if err != nil {
		slog.Warn("close failed", "what", what, "err", err)
	}
}
