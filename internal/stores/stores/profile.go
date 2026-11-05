package stores

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Profile is a public store profile and listing/review summary.
type Profile struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Image         string    `json:"image"`
	AvatarURL     string    `json:"avatar_url"`
	City          string    `json:"city"`
	Province      string    `json:"province"`
	ItemCount     int       `json:"item_count"`
	MaterialNames []string  `json:"material_names"`
	AverageRating *float64  `json:"average_rating"`
	ReviewCount   int       `json:"review_count"`
	CreatedAt     time.Time `json:"created_at"`
}

var profileColumns = `u.id,` + database.DisplayName("u") + `,
	COALESCE(u.image,''),CASE WHEN u.avatar_key IS NOT NULL THEN '/api/users/'||u.id||'/avatar' ELSE COALESCE(u.image,'') END,COALESCE(u.city,''),COALESCE(u.province,''),
	(SELECT count(*) FROM stock s WHERE s.owner_id=u.id AND s.is_listed AND s.weight>0),
	ARRAY(SELECT DISTINCT m.name FROM stock s JOIN materials m ON m.id=s.material_id
	WHERE s.owner_id=u.id AND s.is_listed AND s.weight>0 ORDER BY m.name),
	u.created_at`

// Find reads one active business by its users ID.
func (records *Store) Find(ctx context.Context, id string) (Profile, error) {
	var item Profile
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT `+profileColumns+`
		FROM users u WHERE u.id=$1 AND u.role='business' AND NOT u.is_removed`,
		id,
	).Scan(
		&item.ID,
		&item.Name,
		&item.Image,
		&item.AvatarURL,
		&item.City,
		&item.Province,
		&item.ItemCount,
		&item.MaterialNames,
		&item.CreatedAt,
	)

	return item, err
}

// List includes active business profiles, including businesses with no listed stock.
func (records *Store) List(ctx context.Context, search, exclude string, query paging.Query) ([]Profile, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT `+profileColumns+`
		FROM users u WHERE u.role='business' AND NOT u.is_removed AND u.id<>$1
		AND ($2='' OR u.business_name ILIKE '%'||$2||'%' OR u.name ILIKE '%'||$2||'%')
		AND ($3='' OR (u.created_at,u.id)<($4,$3))
		ORDER BY u.created_at DESC,u.id DESC LIMIT NULLIF($5,0)`,
		exclude,
		search,
		query.ID,
		query.At,
		query.Size(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Profile{}
	for rows.Next() {
		var item Profile
		if err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.Image,
			&item.AvatarURL,
			&item.City,
			&item.Province,
			&item.ItemCount,
			&item.MaterialNames,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	return items, rows.Err()
}
