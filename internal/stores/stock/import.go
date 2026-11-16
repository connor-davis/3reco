package stock

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Material is the id and name a CSV row can point at.
type Material struct {
	ID   string
	Name string
}

// Materials lists the whole catalogue. It is small, so an import checks every
// row against one read instead of one query per row.
func (records *Store) Materials(ctx context.Context) ([]Material, error) {
	rows, err := records.db.Q(ctx).Query(ctx, `SELECT id,name FROM materials ORDER BY name,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	materials := []Material{}
	for rows.Next() {
		var material Material
		if err := rows.Scan(&material.ID, &material.Name); err != nil {
			return nil, err
		}

		materials = append(materials, material)
	}

	return materials, rows.Err()
}

// TellImport alerts people once per import, however many rows were listed.
// Followers get one store_new_listing; people with a matching saved search who
// do not follow the store get one saved_search_match. Both join the caller's
// transaction, so an import that rolls back tells nobody.
func (records *Store) TellImport(ctx context.Context, owner string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}

	_, err := records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO notifications (id,user_id,type,title,body,link)
		SELECT md5(random()::text||f.user_id||u.id),f.user_id,'store_new_listing',
			`+database.DisplayName("u")+`||' has '||c.n||' new listing'||CASE WHEN c.n=1 THEN '' ELSE 's' END,
			'Open the store to see what is new.','/market/store/'||u.id
		FROM business_profiles u
		JOIN follows f ON f.store_id=u.id
		JOIN users person ON person.id=f.user_id AND NOT person.is_removed
		CROSS JOIN (SELECT count(*) AS n FROM stock
			WHERE id=ANY($2) AND owner_id=$1 AND is_listed AND weight>0) c
		WHERE u.id=$1 AND c.n>0 AND NOT u.is_removed AND u.role='business' AND `+database.Verified("u"),
		owner,
		ids,
	)
	if err != nil {
		return err
	}

	_, err = records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO notifications (id,user_id,type,title,body,link)
		SELECT md5(random()::text||person.id||u.id),person.id,'saved_search_match',
			'New listings match your search',
			`+database.DisplayName("u")+`||' listed something you are looking for.',
			'/market/store/'||u.id
		FROM business_profiles u
		JOIN users person ON NOT person.is_removed
		WHERE u.id=$1 AND NOT u.is_removed AND u.role='business' AND `+database.Verified("u")+`
		AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.store_id=u.id AND f.user_id=person.id)
		AND EXISTS (SELECT 1 FROM stock s JOIN saved_searches search
				ON search.material_id=s.material_id
			WHERE s.id=ANY($2) AND s.owner_id=$1 AND s.is_listed AND s.weight>0
			AND search.user_id=person.id
			AND (search.min_price IS NULL OR s.price>=search.min_price)
			AND (search.max_price IS NULL OR s.price<=search.max_price))`,
		owner,
		ids,
	)

	return err
}
