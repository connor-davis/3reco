package admin

import (
	"context"
	"time"
)

// ExportUsers streams allowlisted active account columns without payout fields.
// Business columns stay blank for other roles, as on screen: leftover data from an
// old role is not exported (D2).
func (s *Store) ExportUsers(ctx context.Context, role, like string, visit func([]string) error) error {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT COALESCE(email,''),COALESCE(role,''),
		COALESCE(first_name,''),COALESCE(last_name,''),
		CASE WHEN role='business' THEN COALESCE(business_name,'') ELSE '' END,
		CASE WHEN role='business' THEN COALESCE(business_registration_number,'') ELSE '' END,
		COALESCE(phone,''),COALESCE(street_address,''),
		COALESCE(city,''),COALESCE(area_code::text,''),COALESCE(province,''),created_at,
		CASE WHEN COALESCE(role,'')<>'business' THEN '' WHEN business_verified_at IS NOT NULL THEN 'Verified' ELSE 'Unverified' END
		FROM users u WHERE NOT is_removed AND ($1='' OR role=$1)
		AND ($2='' OR name ILIKE $2 OR email ILIKE $2 OR business_name ILIKE $2
			OR concat_ws(' ',first_name,last_name) ILIKE $2)
		ORDER BY created_at DESC,id DESC`, role, like)
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
