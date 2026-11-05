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
