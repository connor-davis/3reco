// Package auth is the database access for users, sessions and one-time
// tokens. It holds SQL only; the rules live in services/auth.
package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// ErrEmailTaken means another user already has that email.
var ErrEmailTaken = errors.New("email already registered")

// User is a signed-in person as the API shows them to themselves. The
// password hash never leaves the server.
type User struct {
	ID              string  `json:"id"`
	Email           *string `json:"email"`
	EmailVerified   bool    `json:"emailVerified"`
	Name            string  `json:"name"`
	Image           *string `json:"image"`
	Role            *string `json:"role"`
	ProfileComplete bool    `json:"profileComplete"`
	AgreedToTerms   bool    `json:"agreedToTerms"`
	FirstName       *string `json:"firstName"`
	LastName        *string `json:"lastName"`
	BusinessName    *string `json:"businessName"`
	IsRemoved       bool    `json:"-"`
	PasswordHash    *string `json:"-"`
}

// Session is one browser session joined to its user.
type Session struct {
	ID          string
	TokenHash   string
	User        User
	CreatedAt   time.Time
	RefreshedAt time.Time
	ExpiresAt   time.Time
}

// Store runs the auth SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

const userCols = `u.id, u.email, u.email_verified, u.name, u.image, u.role, u.profile_complete,
	u.agreed_to_terms, u.first_name, u.last_name, u.business_name, u.is_removed, u.password_hash`

func scanUser(row pgx.Row, u *User) error {
	return row.Scan(&u.ID, &u.Email, &u.EmailVerified, &u.Name, &u.Image, &u.Role,
		&u.ProfileComplete, &u.AgreedToTerms, &u.FirstName, &u.LastName, &u.BusinessName,
		&u.IsRemoved, &u.PasswordHash)
}

// NewUser is what sign-up and `admin create` hand to CreateUser.
type NewUser struct {
	Name         string
	Email        string
	PasswordHash string
	Role         string // empty is stored as guest
	Verified     bool
	// NoticeVersion is the privacy notice the person accepted; empty for
	// accounts made by `admin create`.
	NoticeVersion string
}

// CreateUser inserts a user and returns ErrEmailTaken on a duplicate email.
func (s *Store) CreateUser(ctx context.Context, in NewUser) (User, error) {
	var role *string
	if in.Role != "" {
		role = &in.Role
	}

	var verifiedAt *time.Time
	if in.Verified {
		now := time.Now()
		verifiedAt = &now
	}

	id := database.NewID()

	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO users (id, email, email_verified, email_verified_at, password_hash, name, role,
			agreed_to_terms)
		VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'guest'), $8)`,
		id, strings.ToLower(in.Email), in.Verified, verifiedAt, in.PasswordHash, in.Name, role,
		in.NoticeVersion != "")
	if _, dup := database.IsUnique(err); dup {
		return User{}, ErrEmailTaken
	}

	if err != nil {
		return User{}, err
	}

	if in.NoticeVersion != "" {
		_, err = s.db.Q(ctx).Exec(ctx, `
			INSERT INTO privacy_notice_acceptances (user_id, version) VALUES ($1, $2)`,
			id, in.NoticeVersion)
		if err != nil {
			return User{}, err
		}
	}

	return s.UserByID(ctx, id)
}

// UserByEmail finds a user by email, ignoring case. It returns nil when none.
func (s *Store) UserByEmail(ctx context.Context, email string) (*User, error) {
	var u User

	err := scanUser(s.db.Q(ctx).QueryRow(ctx,
		`SELECT `+userCols+` FROM users u WHERE lower(u.email) = lower($1)`, email), &u)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}

	return &u, err
}

// UserByID finds a user by id. It returns pgx.ErrNoRows when none.
func (s *Store) UserByID(ctx context.Context, id string) (User, error) {
	var u User

	err := scanUser(s.db.Q(ctx).QueryRow(ctx,
		`SELECT `+userCols+` FROM users u WHERE u.id = $1`, id), &u)

	return u, err
}

// SetPassword stores a new password hash.
func (s *Store) SetPassword(ctx context.Context, userID, hash string) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, userID, hash)

	return err
}

// MarkVerified records that the user proved their email address.
func (s *Store) MarkVerified(ctx context.Context, userID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE users SET email_verified = true,
			email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
		WHERE id = $1`, userID)

	return err
}

// MakeAdmin sets the role to admin and marks the email verified. The CLI uses
// it for an email that already has an account.
func (s *Store) MakeAdmin(ctx context.Context, userID, passwordHash string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE users SET role = 'admin', email_verified = true,
			email_verified_at = COALESCE(email_verified_at, now()), password_hash = $2,
			is_removed = false, updated_at = now()
		WHERE id = $1`, userID, passwordHash)

	return err
}

// CreateSession stores a session whose cookie token hashes to tokenHash.
func (s *Store) CreateSession(
	ctx context.Context,
	userID, tokenHash, ip, userAgent string,
	ttl time.Duration,
) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, expires_at)
		VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
		database.NewID(), userID, tokenHash, ip, userAgent, ttl.Seconds())

	return err
}

// SessionsByHashes returns the live sessions (not expired, user not removed)
// whose token hash is in hashes, oldest first.
func (s *Store) SessionsByHashes(ctx context.Context, hashes []string) ([]Session, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT s.id, s.token_hash, s.created_at, s.refreshed_at, s.expires_at, `+userCols+`
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ANY($1) AND s.expires_at > now() AND NOT u.is_removed
		ORDER BY s.created_at`, hashes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Session

	for rows.Next() {
		var sess Session

		u := &sess.User

		err := rows.Scan(&sess.ID, &sess.TokenHash, &sess.CreatedAt, &sess.RefreshedAt, &sess.ExpiresAt,
			&u.ID, &u.Email, &u.EmailVerified, &u.Name, &u.Image, &u.Role, &u.ProfileComplete,
			&u.AgreedToTerms, &u.FirstName, &u.LastName, &u.BusinessName, &u.IsRemoved,
			&u.PasswordHash)
		if err != nil {
			return nil, err
		}

		out = append(out, sess)
	}

	return out, rows.Err()
}

// SessionByID returns one live session, or pgx.ErrNoRows.
func (s *Store) SessionByID(ctx context.Context, id string) (Session, error) {
	var sess Session

	u := &sess.User

	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT s.id, s.token_hash, s.created_at, s.refreshed_at, s.expires_at, `+userCols+`
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.id = $1 AND s.expires_at > now() AND NOT u.is_removed`, id).
		Scan(&sess.ID, &sess.TokenHash, &sess.CreatedAt, &sess.RefreshedAt, &sess.ExpiresAt,
			&u.ID, &u.Email, &u.EmailVerified, &u.Name, &u.Image, &u.Role, &u.ProfileComplete,
			&u.AgreedToTerms, &u.FirstName, &u.LastName, &u.BusinessName, &u.IsRemoved,
			&u.PasswordHash)

	return sess, err
}

// SlideSession pushes a session's expiry forward from now.
func (s *Store) SlideSession(ctx context.Context, id string, ttl time.Duration) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE sessions SET refreshed_at = now(), expires_at = now() + make_interval(secs => $2)
		WHERE id = $1`, id, ttl.Seconds())

	return err
}

// DeleteSessions removes sessions by id. It only touches the ids given.
func (s *Store) DeleteSessions(ctx context.Context, ids []string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `DELETE FROM sessions WHERE id = ANY($1)`, ids)

	return err
}

// DeleteUserSessions signs a user out of every browser.
func (s *Store) DeleteUserSessions(ctx context.Context, userID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)

	return err
}

// ReplaceToken stores a one-time token and drops the user's older ones of the
// same kind, so only the newest link works.
func (s *Store) ReplaceToken(
	ctx context.Context,
	kind, userID, tokenHash string,
	ttl time.Duration,
) error {
	if _, err := s.db.Q(ctx).Exec(ctx,
		`DELETE FROM auth_tokens WHERE user_id = $1 AND kind = $2`, userID, kind); err != nil {
		return err
	}

	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO auth_tokens (token_hash, kind, user_id, expires_at)
		VALUES ($1, $2, $3, now() + make_interval(secs => $4))`, tokenHash, kind, userID, ttl.Seconds())

	return err
}

// ConsumeToken uses a token once. It returns the user id, or pgx.ErrNoRows
// when the token is unknown, used or expired.
func (s *Store) ConsumeToken(ctx context.Context, kind, tokenHash string) (string, error) {
	var userID string

	err := s.db.Q(ctx).QueryRow(ctx, `
		DELETE FROM auth_tokens WHERE token_hash = $1 AND kind = $2 AND expires_at > now()
		RETURNING user_id`, tokenHash, kind).Scan(&userID)

	return userID, err
}

// Purge deletes expired sessions, tokens and rate counts.
func (s *Store) Purge(ctx context.Context) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		DELETE FROM sessions WHERE expires_at < now();
		DELETE FROM auth_tokens WHERE expires_at < now();
		DELETE FROM rate_counts WHERE until < now();`)

	return err
}

// Hit counts one request against key and returns how many were made in the
// current one-minute window.
func (s *Store) Hit(ctx context.Context, key string) (int, error) {
	var n int

	err := s.db.Q(ctx).QueryRow(ctx, `
		INSERT INTO rate_counts (key, n, until) VALUES ($1, 1, now() + interval '1 minute')
		ON CONFLICT (key) DO UPDATE SET
			n = CASE WHEN rate_counts.until < now() THEN 1 ELSE rate_counts.n + 1 END,
			until = CASE WHEN rate_counts.until < now()
				THEN now() + interval '1 minute' ELSE rate_counts.until END
		RETURNING n`, key).Scan(&n)

	return n, err
}
