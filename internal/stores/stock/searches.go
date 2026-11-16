package stock

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// TellSearchers tells each matching person once, inside the first-publication
// transaction. Followers already received their alert from TellFollowers.
func (records *Store) TellSearchers(ctx context.Context, id string) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO notifications (id,user_id,type,title,body,link)
		SELECT md5(random()::text||person.id||s.id),person.id,'saved_search_match',
			'A new listing matches your search',
			m.name||' at R '||s.price::text||' per kg','/market/listing/'||s.id
		FROM stock s JOIN materials m ON m.id=s.material_id
		JOIN business_profiles u ON u.id=s.owner_id
		JOIN users person ON NOT person.is_removed
		WHERE s.id=$1 AND s.is_listed AND s.weight>0
		AND NOT u.is_removed AND u.role='business' AND `+database.Verified("u")+`
		AND EXISTS (SELECT 1 FROM saved_searches search
			WHERE search.user_id=person.id AND search.material_id=s.material_id
			AND (search.min_price IS NULL OR s.price>=search.min_price)
			AND (search.max_price IS NULL OR s.price<=search.max_price))
		AND NOT EXISTS (SELECT 1 FROM notifications n
			WHERE n.user_id=person.id AND n.type='store_new_listing'
			AND n.link='/market/listing/'||s.id)`,
		id,
	)

	return err
}
