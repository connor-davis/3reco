package businesses

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// Workspace is a business the caller may act for.
type Workspace struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Role    string `json:"role"`
	HasLogo bool   `json:"has_logo"`
}

// Mine lists only the caller's active business memberships, ordered by name.
func (s *Store) Mine(ctx context.Context, userID string) ([]Workspace, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT b.id,COALESCE(b.business_name,'Your business'),m.role,
		COALESCE(b.avatar_key,'')<>'' FROM business_members m
		JOIN businesses b ON b.id=m.business_id JOIN users u ON u.id=m.user_id
		WHERE m.user_id=$1 AND NOT b.is_removed AND NOT u.is_removed
		ORDER BY COALESCE(b.business_name,'Your business'),b.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return pgx.CollectRows(rows, pgx.RowToStructByPos[Workspace])
}

// Select changes only the live session whose user belongs to this business.
func (s *Store) Select(ctx context.Context, sessionID, businessID string) (bool, error) {
	tag, err := s.db.Q(ctx).Exec(ctx, `UPDATE sessions s SET active_business_id=$2
		WHERE s.id=$1 AND s.expires_at>now() AND EXISTS(
			SELECT 1 FROM business_members m WHERE m.business_id=$2 AND m.user_id=s.user_id)`,
		sessionID, businessID)

	return tag.RowsAffected() == 1, err
}
