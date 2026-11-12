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
	Verified      bool      `json:"business_verified"`
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
	COALESCE(st.items,0),COALESCE(st.names,'{}'::text[]),
	u.created_at,` + database.Verified("u")

// profileSelect reads the page of users first, then sums their stock in one grouped pass.
func profileSelect(page string) string {
	return `WITH page AS (` + page + `)
	SELECT ` + profileColumns + ` FROM page u
	LEFT JOIN (SELECT s.owner_id,count(*) AS items,array_agg(DISTINCT m.name ORDER BY m.name) AS names
		FROM stock s JOIN materials m ON m.id=s.material_id
		WHERE s.owner_id = ANY(ARRAY(SELECT id FROM page)) AND s.is_listed AND s.weight>0
		GROUP BY s.owner_id) st ON st.owner_id=u.id
	ORDER BY u.created_at DESC,u.id DESC`
}

// Find reads one active business by its users ID.
// An unverified business is hidden from everyone but itself, so its owner can
// still open the store page and manage stock.
func (records *Store) Find(ctx context.Context, id, viewer string) (Profile, error) {
	var item Profile
	err := records.db.Q(ctx).QueryRow(
		ctx,
		profileSelect(`SELECT * FROM users u WHERE u.id=$1 AND u.role='business' AND NOT u.is_removed
		AND (`+database.Verified("u")+` OR u.id=$2)`),
		id,
		viewer,
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
		&item.Verified,
	)

	return item, err
}

// List includes active business profiles, including businesses with no listed stock.
func (records *Store) List(ctx context.Context, search, exclude string, query paging.Query) ([]Profile, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		profileSelect(`SELECT * FROM users u WHERE u.role='business' AND NOT u.is_removed AND u.id<>$1
		AND `+database.Verified("u")+`
		AND ($2='' OR u.business_name ILIKE '%'||$2||'%' OR u.name ILIKE '%'||$2||'%')
		AND ($3='' OR (u.created_at,u.id)<($4,$3))
		ORDER BY u.created_at DESC,u.id DESC LIMIT NULLIF($5,0)`),
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
			&item.Verified,
		); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	return items, rows.Err()
}
