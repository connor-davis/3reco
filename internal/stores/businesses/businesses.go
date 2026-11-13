// Package businesses owns business membership and session tenant selection SQL.
package businesses

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Store reads businesses independently of the person who opened them.
type Store struct{ db *database.DB }

// New builds the business store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Lock holds an active business for an administrator's verification change.
func (s *Store) Lock(ctx context.Context, id string) (bool, error) {
	var found string
	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT id FROM businesses WHERE id=$1 AND NOT is_removed FOR UPDATE`, id).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}

	return err == nil, err
}

// EnsureOwner creates the initial business when an administrator promotes an
// account. An existing business's memberships are never changed by a person role.
func (s *Store) EnsureOwner(ctx context.Context, userID string) error {
	tag, err := s.db.Q(ctx).Exec(ctx, `INSERT INTO businesses
		(id,business_name,bank_account_holder_name,bank_name,bank_account_number,bank_branch_code,
		bank_account_type,street_address,city,province,area_code,avatar_key,image)
		SELECT id,name,bank_account_holder_name,bank_name,bank_account_number,bank_branch_code,
		bank_account_type,street_address,city,province,area_code,avatar_key,image FROM users WHERE id=$1
		ON CONFLICT DO NOTHING`, userID)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}

	_, err = s.db.Q(ctx).Exec(ctx,
		`INSERT INTO business_members VALUES($1,$1,'owner')`, userID)

	return err
}

// Membership returns the live role and verification for a business member.
// An empty role means the person no longer belongs to that business.
func (s *Store) Membership(ctx context.Context, businessID, userID string) (string, bool, error) {
	var role string
	var verified bool

	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT COALESCE((SELECT m.role FROM business_members m JOIN users u ON u.id=m.user_id
			WHERE m.business_id=$1 AND m.user_id=$2 AND NOT u.is_removed), ''),
		EXISTS(SELECT 1 FROM businesses WHERE id=$1 AND business_verified_at IS NOT NULL)`,
		businessID, userID).Scan(&role, &verified)

	return role, verified, err
}

// SelectDefault chooses the person's own business first, or their first membership.
// It only fills an unselected session; a removed membership is never restored here.
func (s *Store) SelectDefault(ctx context.Context, sessionID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE sessions s SET active_business_id=(
			SELECT m.business_id FROM business_members m WHERE m.user_id=s.user_id
			ORDER BY (m.business_id=s.user_id) DESC, m.business_id LIMIT 1)
		WHERE s.id=$1 AND s.active_business_id IS NULL`, sessionID)

	return err
}

// Name returns the selected business's name for the existing /me JSON field.
func (s *Store) Name(ctx context.Context, id string) (*string, error) {
	var name *string
	err := s.db.Q(ctx).QueryRow(ctx, `SELECT business_name FROM businesses WHERE id=$1`, id).Scan(&name)

	return name, err
}
