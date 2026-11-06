// Package importer holds the SQL for the one-time Convex import. Services
// build the rows; this package only checks the database is empty and writes.
package importer

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// importLockKey is the advisory lock that keeps two imports from running at
// once. The migration lock is 3_000_001.
const importLockKey = 3_000_002

// guardedTables must hold no rows before an import starts. sessions is in the
// list so a database somebody already signed in to is refused too.
var guardedTables = []string{
	"users", "collectors", "materials", "stock", "transactions",
	"transaction_requests", "notifications", "carts", "store_reviews", "sessions",
}

// realtimeTables carry the `realtime` trigger that sends NOTIFY. It is off
// for the import so a running server hears nothing about data it cannot see.
var realtimeTables = []string{
	"notifications", "stock", "carts", "cart_items", "transaction_requests",
	"transaction_request_messages", "transactions",
	"users", "materials",
}

var identifier = regexp.MustCompile(`^[a-z_]+$`)

// Row is one row to insert: column name to value.
type Row map[string]any

// Typed is a value Postgres must read from text as the named type. It keeps
// money exact: a numeric travels as its digits, never as a float.
type Typed struct {
	Type string // numeric, date or jsonb
	Text string
}

// Batch is every row for one table.
type Batch struct {
	Table string
	Rows  []Row
}

// RemovedBy sets users.removed_by once every user row exists.
type RemovedBy struct {
	UserID    string
	RemovedBy string
}

// Store runs the import SQL.
type Store struct {
	db *database.DB
}

// New builds the store.
func New(db *database.DB) *Store {
	return &Store{db: db}
}

// NotEmptyError names the first table that already holds rows.
type NotEmptyError struct {
	Table string
	Rows  int
}

// Error says which table blocked the import.
func (e *NotEmptyError) Error() string {
	return fmt.Sprintf(
		"the database is not empty (%s has %d rows); the import only runs on an empty database",
		e.Table, e.Rows,
	)
}

// EnsureEmpty returns a *NotEmptyError when a guarded table has rows.
func (s *Store) EnsureEmpty(ctx context.Context) error {
	for _, table := range guardedTables {
		var rows int

		err := s.db.Q(ctx).QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&rows)
		if err != nil {
			return err
		}

		if rows > 0 {
			return &NotEmptyError{Table: table, Rows: rows}
		}
	}

	return nil
}

// Begin takes the import lock, re-checks the database is empty and turns the
// realtime triggers off for this transaction. Call it first inside InTx.
func (s *Store) Begin(ctx context.Context) error {
	q := s.db.Q(ctx)

	if _, err := q.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", importLockKey); err != nil {
		return err
	}

	if err := s.EnsureEmpty(ctx); err != nil {
		return err
	}

	// Not session_replication_role: "replica" would switch the foreign-key
	// checks off too, and those are our last safety net.
	for _, table := range realtimeTables {
		if _, err := q.Exec(ctx, "ALTER TABLE "+table+" DISABLE TRIGGER realtime"); err != nil {
			return fmt.Errorf("switch off triggers on %s (the importer must own the table): %w", table, err)
		}
	}

	return nil
}

// Finish turns the realtime triggers back on. Call it last inside InTx.
func (s *Store) Finish(ctx context.Context) error {
	// Message triggers were off during import; restore the indexed inbox order
	// from the historical timestamps before live notifications resume.
	_, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE transaction_requests r SET activity_at = COALESCE(
			(SELECT max(created_at) FROM transaction_request_messages WHERE request_id = r.id),
			r.created_at)`)
	if err != nil {
		return err
	}

	for _, table := range realtimeTables {
		if _, err := s.db.Q(ctx).Exec(ctx, "ALTER TABLE "+table+" ENABLE TRIGGER realtime"); err != nil {
			return err
		}
	}

	return nil
}

// Insert writes every row of the batch.
func (s *Store) Insert(ctx context.Context, batch Batch) error {
	if !identifier.MatchString(batch.Table) {
		return fmt.Errorf("bad table name %q", batch.Table)
	}

	for _, row := range batch.Rows {
		sql, args, err := insertSQL(batch.Table, row)
		if err != nil {
			return err
		}

		if _, err := s.db.Q(ctx).Exec(ctx, sql, args...); err != nil {
			return fmt.Errorf("insert into %s: %w", batch.Table, err)
		}
	}

	return nil
}

// insertSQL builds one INSERT. Column names come from the importer's own
// field tables, but are checked anyway.
func insertSQL(table string, row Row) (string, []any, error) {
	columns := make([]string, 0, len(row))
	for column := range row {
		if !identifier.MatchString(column) {
			return "", nil, fmt.Errorf("bad column name %q", column)
		}

		columns = append(columns, column)
	}

	// A stable order keeps the statement text the same for every row.
	sort.Strings(columns)

	args := make([]any, 0, len(columns))
	marks := make([]string, 0, len(columns))

	for i, column := range columns {
		mark := fmt.Sprintf("$%d", i+1)

		if typed, ok := row[column].(Typed); ok {
			if !identifier.MatchString(typed.Type) {
				return "", nil, fmt.Errorf("bad type name %q", typed.Type)
			}

			mark += "::text::" + typed.Type
			args = append(args, typed.Text)
		} else {
			args = append(args, row[column])
		}

		marks = append(marks, mark)
	}

	sql := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		table, strings.Join(columns, ", "), strings.Join(marks, ", "),
	)

	return sql, args, nil
}

// SetRemovedBy fills users.removed_by after every user row exists.
func (s *Store) SetRemovedBy(ctx context.Context, updates []RemovedBy) error {
	for _, update := range updates {
		_, err := s.db.Q(ctx).Exec(ctx,
			`UPDATE users SET removed_by = $2 WHERE id = $1`, update.UserID, update.RemovedBy)
		if err != nil {
			return err
		}
	}

	return nil
}

// LegacyAcceptances records the old agreed_to_terms flag as notice version
// "legacy", so those people are asked again for the current notice.
func (s *Store) LegacyAcceptances(ctx context.Context) error {
	_, err := s.db.Q(ctx).Exec(ctx, `INSERT INTO privacy_notice_acceptances (user_id, version, accepted_at)
		SELECT id, 'legacy', updated_at FROM users WHERE agreed_to_terms AND NOT is_removed`)

	return err
}

// Count returns the rows in a table, for the report.
func (s *Store) Count(ctx context.Context, table string) (int, error) {
	if !identifier.MatchString(table) {
		return 0, fmt.Errorf("bad table name %q", table)
	}

	var rows int

	err := s.db.Q(ctx).QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&rows)

	return rows, err
}
