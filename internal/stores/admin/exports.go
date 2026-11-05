package admin

import (
	"context"
	"time"
)

// ExportUsers streams allowlisted active account columns without payout fields.
func (s *Store) ExportUsers(ctx context.Context, visit func([]string) error) error {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT COALESCE(email,''),COALESCE(role,''),
		COALESCE(first_name,''),COALESCE(last_name,''),COALESCE(business_name,''),
		COALESCE(business_registration_number,''),COALESCE(phone,''),COALESCE(street_address,''),
		COALESCE(city,''),COALESCE(area_code::text,''),COALESCE(province,''),created_at
		FROM users WHERE NOT is_removed ORDER BY created_at DESC,id DESC`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		values := make([]string, 12)
		var registered time.Time
		err := rows.Scan(&values[0], &values[1], &values[2], &values[3], &values[4], &values[5],
			&values[6], &values[7], &values[8], &values[9], &values[10], &registered)
		if err != nil {
			return err
		}

		values[11] = registered.UTC().Format(time.RFC3339)
		if err := visit(values); err != nil {
			return err
		}
	}

	return rows.Err()
}
