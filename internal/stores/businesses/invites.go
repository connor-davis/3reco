package businesses

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// Invite is a Team invitation. Its hash never appears in JSON.
type Invite struct {
	ID         string     `json:"id"`
	BusinessID string     `json:"-"`
	Email      string     `json:"email"`
	Role       string     `json:"role"`
	TokenHash  string     `json:"-"`
	ExpiresAt  time.Time  `json:"expires_at"`
	AcceptedAt *time.Time `json:"-"`
	RevokedAt  *time.Time `json:"-"`
	CreatedAt  time.Time  `json:"created_at"`
}

const inviteCols = `id,business_id,email,role,token_hash,expires_at,accepted_at,revoked_at,created_at`

// Invites lists unaccepted, unrevoked invites, including ones needing a resend.
func (s *Store) Invites(ctx context.Context, businessID string) ([]Invite, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT `+inviteCols+` FROM business_invites
		WHERE business_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL
		ORDER BY created_at,id`, businessID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return pgx.CollectRows(rows, pgx.RowToStructByPos[Invite])
}

// InsertInvite stores only the digest of the mailed token.
func (s *Store) InsertInvite(ctx context.Context, in Invite, actor string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `INSERT INTO business_invites
		(id,business_id,email,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
		in.ID, in.BusinessID, in.Email, in.Role, in.TokenHash, actor, in.ExpiresAt)

	return err
}

// InviteByID locks one live invitation belonging to the active business.
func (s *Store) InviteByID(ctx context.Context, businessID, id string) (Invite, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT `+inviteCols+` FROM business_invites
		WHERE id=$1 AND business_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL
		FOR UPDATE`, id, businessID)
	if err != nil {
		return Invite{}, err
	}

	return pgx.CollectOneRow(rows, pgx.RowToStructByPos[Invite])
}

// InviteByHash finds a still usable link; accept requests lock it against reuse.
func (s *Store) InviteByHash(ctx context.Context, hash string, lock bool) (Invite, error) {
	query := `SELECT ` + inviteCols + ` FROM business_invites WHERE token_hash=$1
		AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()`
	if lock {
		query += ` FOR UPDATE`
	}

	rows, err := s.db.Q(ctx).Query(ctx, query, hash)
	if err != nil {
		return Invite{}, err
	}

	return pgx.CollectOneRow(rows, pgx.RowToStructByPos[Invite])
}

// RotateInvite invalidates the previous link while retaining invitation history.
func (s *Store) RotateInvite(ctx context.Context, businessID, id, hash string, expiry time.Time) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE business_invites SET token_hash=$3,expires_at=$4
		WHERE business_id=$1 AND id=$2`, businessID, id, hash, expiry)

	return err
}

// RevokeInvite keeps the invitation as history, with no usable link.
func (s *Store) RevokeInvite(ctx context.Context, businessID, id string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE business_invites SET revoked_at=now()
		WHERE business_id=$1 AND id=$2`, businessID, id)

	return err
}

// AcceptInvite marks the locked invitation used.
func (s *Store) AcceptInvite(ctx context.Context, id string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE business_invites SET accepted_at=now() WHERE id=$1`, id)

	return err
}
