package businesses

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// Member is the owner-visible team directory entry.
type Member struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// Members lists the active people in one business.
func (s *Store) Members(ctx context.Context, businessID string) ([]Member, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT u.id,u.name,COALESCE(u.email,''),m.role
		FROM business_members m JOIN users u ON u.id=m.user_id
		WHERE m.business_id=$1 AND NOT u.is_removed ORDER BY u.name,u.id`, businessID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return pgx.CollectRows(rows, pgx.RowToStructByPos[Member])
}

// OwnerCount counts active owners while the caller holds the business lock.
func (s *Store) OwnerCount(ctx context.Context, businessID string) (int, error) {
	var count int
	err := s.db.Q(ctx).QueryRow(ctx, `SELECT count(*) FROM business_members m
		JOIN users u ON u.id=m.user_id
		WHERE m.business_id=$1 AND m.role='owner' AND NOT u.is_removed`, businessID).Scan(&count)

	return count, err
}

// HasMemberEmail checks membership within this business only.
func (s *Store) HasMemberEmail(ctx context.Context, businessID, email string) (bool, error) {
	var found bool
	err := s.db.Q(ctx).QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM business_members m
		JOIN users u ON u.id=m.user_id WHERE m.business_id=$1 AND lower(u.email)=$2
		AND NOT u.is_removed)`, businessID, email).Scan(&found)

	return found, err
}

// SetMemberRole changes only a membership in the named business.
func (s *Store) SetMemberRole(ctx context.Context, businessID, userID, role string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE business_members SET role=$3
		WHERE business_id=$1 AND user_id=$2`, businessID, userID, role)

	return err
}

// RemoveMember deletes membership and clears that business from all their sessions.
func (s *Store) RemoveMember(ctx context.Context, businessID, userID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `DELETE FROM business_members
		WHERE business_id=$1 AND user_id=$2`, businessID, userID)
	if err != nil {
		return err
	}

	_, err = s.db.Q(ctx).Exec(ctx, `UPDATE sessions SET active_business_id=NULL
		WHERE user_id=$1 AND active_business_id=$2`, userID, businessID)

	return err
}

// Join inserts an accepted membership without changing any existing role.
func (s *Store) Join(ctx context.Context, businessID, userID, role string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `INSERT INTO business_members(business_id,user_id,role)
		VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, businessID, userID, role)

	return err
}

// PrepareInvitee verifies the address and completes setup for a new or guest person.
// Existing platform roles and their profile completion state stay as they are.
func (s *Store) PrepareInvitee(ctx context.Context, userID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE users SET
		profile_complete=CASE WHEN role='guest' THEN true ELSE profile_complete END,
		role=CASE WHEN role='guest' THEN 'business' ELSE role END,
		email_verified=true,email_verified_at=COALESCE(email_verified_at,now()),updated_at=now()
		WHERE id=$1 AND NOT is_removed`, userID)

	return err
}

// SelectInvitedBusiness selects the invitation only for an unselected session.
func (s *Store) SelectInvitedBusiness(ctx context.Context, sessionID, businessID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE sessions SET active_business_id=$2
		WHERE id=$1 AND active_business_id IS NULL`, sessionID, businessID)

	return err
}

// SetAcceptActor names a newly created person before their membership is audited.
func (s *Store) SetAcceptActor(ctx context.Context, userID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `SELECT set_config('app.actor_id',$1,true)`, userID)

	return err
}
