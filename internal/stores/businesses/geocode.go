package businesses

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/geo"
)

// SetPoint avoids overwriting a newer address or an already populated point.
func (s *Store) SetPoint(ctx context.Context, item Profile, point geo.Point) error {
	return s.db.InTx(ctx, func(ctx context.Context) error {
		_, err := s.db.Q(ctx).Exec(ctx, `UPDATE businesses SET latitude=$2,longitude=$3
		WHERE id=$1 AND NOT is_removed AND latitude IS NULL
		AND COALESCE(street_address,'')=$4 AND COALESCE(city,'')=$5
		AND COALESCE(province,'')=$6 AND area_code IS NOT DISTINCT FROM $7`,
			item.ID, point.Lat, point.Lng, item.StreetAddress, item.City, item.Province, item.AreaCode)

		return err
	})
}

// MissingPoint visits active, addressed businesses in stable id order once per run.
// The service normalizes each address and skips fresh failures through its cache.
func (s *Store) MissingPoint(ctx context.Context, after string) (Profile, error) {
	var item Profile
	err := s.db.Q(ctx).QueryRow(ctx, `SELECT id,street_address,COALESCE(city,''),
		COALESCE(province,''),area_code FROM businesses
		WHERE id>$1 AND NOT is_removed AND latitude IS NULL
		AND NULLIF(trim(street_address),'') IS NOT NULL ORDER BY id LIMIT 1`, after).Scan(
		&item.ID, &item.StreetAddress, &item.City, &item.Province, &item.AreaCode)

	return item, err
}
