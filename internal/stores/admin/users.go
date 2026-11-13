// Package admin is the database access for the admin area: the user list,
// removing a user and the dashboards. SQL only; the rules live in
// services/admin.
package admin

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

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
	// BusinessVerified is true while an admin's verification stands.
	BusinessVerified   bool       `json:"business_verified"`
	BusinessVerifiedAt *time.Time `json:"business_verified_at"`
}

// Store runs the admin SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Users returns up to limit+1 users who are not removed, newest first. like is
// a search pattern over name, email and business name (never the sealed ID or
// bank numbers); role is an exact match. Both are optional.
func (s *Store) Users(
	ctx context.Context,
	cur paging.Cursor,
	limit int,
	like, role string,
) ([]User, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT u.id, `+database.PersonName("u")+`, u.email, u.role, u.profile_complete, u.created_at,
			b.business_verified_at IS NOT NULL, b.business_verified_at
		FROM users u LEFT JOIN businesses b ON b.id=u.id
		WHERE NOT u.is_removed
			AND ($1::timestamptz IS NULL OR (u.created_at, u.id) < ($1, $2))
			AND ($4 = '' OR u.name ILIKE $4 OR u.email ILIKE $4 OR b.business_name ILIKE $4
				OR concat_ws(' ', u.first_name, u.last_name) ILIKE $4)
			AND ($5 = '' OR u.role = $5)
		ORDER BY u.created_at DESC, u.id DESC
		LIMIT $3`, cur.At, cur.ID, limit+1, like, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []User{}

	for rows.Next() {
		var u User

		if err := rows.Scan(
			&u.ID, &u.Name, &u.Email, &u.Role, &u.ProfileComplete, &u.CreatedAt, &u.BusinessVerified, &u.BusinessVerifiedAt,
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

// LockActiveRole locks a user row that is not removed and returns their role.
// found is false when there is no such user.
func (s *Store) LockActiveRole(ctx context.Context, id string) (role string, found bool, err error) {
	var current *string

	err = s.db.Q(ctx).QueryRow(ctx,
		`SELECT role FROM users WHERE id = $1 AND NOT is_removed FOR UPDATE`, id).Scan(&current)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}

	if err != nil || current == nil {
		return "", err == nil, err
	}

	return *current, true, nil
}

// SetBusinessVerified marks a business verified by an admin, or clears it.
func (s *Store) SetBusinessVerified(ctx context.Context, id, adminID string, verified bool) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE businesses SET updated_at = now(),
			business_verified_at = CASE WHEN $3 THEN now() END,
			business_verified_by = CASE WHEN $3 THEN $2 END
		WHERE id = $1`, id, adminID, verified)

	return err
}
