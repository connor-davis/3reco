package admin

import (
	"context"
	"time"
)

// ExportUsers streams allowlisted active account columns without payout fields.
// Business columns stay blank for other roles, as on screen: leftover data from an
// old role is not exported (D2).
func (s *Store) ExportUsers(ctx context.Context, role, like string, visit func([]string) error) error {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT COALESCE(u.email,''),COALESCE(u.role,''),
		COALESCE(u.first_name,''),COALESCE(u.last_name,''),
		CASE WHEN u.role='business' THEN COALESCE(b.business_name,'') ELSE '' END,
		CASE WHEN u.role='business' THEN COALESCE(b.business_registration_number,'') ELSE '' END,
		COALESCE(u.phone,''),COALESCE(CASE WHEN u.role='business' THEN b.street_address ELSE u.street_address END,''),
		COALESCE(CASE WHEN u.role='business' THEN b.city ELSE u.city END,''),COALESCE(CASE WHEN u.role='business' THEN b.area_code ELSE u.area_code END::text,''),COALESCE(CASE WHEN u.role='business' THEN b.province ELSE u.province END,''),u.created_at,
		CASE WHEN COALESCE(u.role,'')<>'business' THEN '' WHEN b.business_verified_at IS NOT NULL THEN 'Verified' ELSE 'Unverified' END
		FROM users u LEFT JOIN businesses b ON b.id=u.id WHERE NOT u.is_removed AND ($1='' OR u.role=$1)
		AND ($2='' OR u.name ILIKE $2 OR u.email ILIKE $2 OR b.business_name ILIKE $2
			OR concat_ws(' ',u.first_name,u.last_name) ILIKE $2)
		ORDER BY u.created_at DESC,u.id DESC`, role, like)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		values := make([]string, 13)
		var registered time.Time
		err := rows.Scan(&values[0], &values[1], &values[2], &values[3], &values[4], &values[5],
			&values[6], &values[7], &values[8], &values[9], &values[10], &registered, &values[12])
		if err != nil {
			return err
		}

		values[11] = registered.In(time.FixedZone("SAST", 7200)).Format(time.DateTime)
		if err := visit(values); err != nil {
			return err
		}
	}

	return rows.Err()
}
