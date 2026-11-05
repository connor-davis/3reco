// Package admin is the database access for the admin area: the user list,
// removing a user and the dashboards. SQL only; the rules live in
// services/admin.
package admin

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// User is one row of the admin user list. Passwords, bank details and ID
// numbers are never in it.
type User struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	Email           *string   `json:"email"`
	Role            *string   `json:"role"`
	ProfileComplete bool      `json:"profile_complete"`
	CreatedAt       time.Time `json:"created_at"`
}

// Store runs the admin SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Users returns up to limit+1 users who are not removed, newest first.
func (s *Store) Users(ctx context.Context, cur paging.Cursor, limit int) ([]User, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT u.id, `+database.DisplayName("u")+`, u.email, u.role, u.profile_complete, u.created_at
		FROM users u
		WHERE NOT u.is_removed
			AND ($1::timestamptz IS NULL OR (u.created_at, u.id) < ($1, $2))
		ORDER BY u.created_at DESC, u.id DESC
		LIMIT $3`, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []User{}

	for rows.Next() {
		var u User

		if err := rows.Scan(
			&u.ID, &u.Name, &u.Email, &u.Role, &u.ProfileComplete, &u.CreatedAt,
		); err != nil {
			return nil, err
		}

		out = append(out, u)
	}

	return out, rows.Err()
}

// LockActive locks a user row that is not removed and reports whether there
// was one.
func (s *Store) LockActive(ctx context.Context, id string) (bool, error) {
	rows, err := s.db.Q(ctx).Query(ctx,
		`SELECT 1 FROM users WHERE id = $1 AND NOT is_removed FOR UPDATE`, id)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	found := rows.Next()

	return found, rows.Err()
}

// SetRole changes a user's role.
func (s *Store) SetRole(ctx context.Context, id, role string) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`UPDATE users SET role = $2, updated_at = now() WHERE id = $1`, id, role)

	return err
}

// Trades lists the transactions a user took part in as buyer or business
// seller; their invoices name the user, so they must be rebuilt on removal.
func (s *Store) Trades(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT id FROM transactions
		WHERE buyer_id = $1 OR (type = 'b2b' AND seller_id = $1)`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string

	for rows.Next() {
		var id string

		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		ids = append(ids, id)
	}

	return ids, rows.Err()
}

// Erase deletes everything private that hangs off a user and blanks the user
// row, keeping only the id so finished transactions and reviews still point
// at a row. The caller runs it inside a transaction.
func (s *Store) Erase(ctx context.Context, id, removedBy string) error {
	q := s.db.Q(ctx)

	// Order does not matter: each of these only points at the user.
	for _, stmt := range []string{
		`DELETE FROM sessions WHERE user_id = $1`,
		`DELETE FROM auth_tokens WHERE user_id = $1`,
		`DELETE FROM notifications WHERE user_id = $1`,
		`DELETE FROM carts WHERE buyer_id = $1 OR seller_id = $1`,
		`DELETE FROM transaction_requests WHERE buyer_id = $1 OR seller_id = $1`,
		`DELETE FROM stock WHERE owner_id = $1`,
	} {
		if _, err := q.Exec(ctx, stmt, id); err != nil {
			return err
		}
	}

	_, err := q.Exec(ctx, `
		UPDATE users SET
			name = 'Removed account', business_name = 'Removed account',
			email = NULL, email_verified = false, email_verified_at = NULL,
			password_hash = NULL, image = NULL, phone = NULL, normalized_phone = NULL,
			role = NULL, profile_complete = false, first_name = NULL, last_name = NULL,
			id_number = NULL, business_registration_number = NULL,
			bank_account_holder_name = NULL, bank_name = NULL, bank_account_number = NULL,
			bank_branch_code = NULL, bank_account_type = NULL, street_address = NULL,
			city = NULL, area_code = NULL, province = NULL,
			is_removed = true, removed_at = now(), removed_by = $2, updated_at = now()
		WHERE id = $1`, id, removedBy)

	return err
}
