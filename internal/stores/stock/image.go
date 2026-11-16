package stock

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// MaxPhotos is how many photos one stock item may have.
const MaxPhotos = 8

// Photo is one picture of a stock item, in cover-first order.
type Photo struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

// CoverURL is the SQL for the cover photo URL of the stock row aliased as alias.
// The version is a hash of the file key, so a new cover busts the browser cache.
func CoverURL(alias string) string {
	return `COALESCE((SELECT '/api/stock/'||p.stock_id||'/image?v='||md5(p.object_key)
		FROM stock_photos p WHERE p.stock_id=` + alias + `.id AND p.position=1),'')`
}

// CoverThumbURL is CoverURL for the small copy. A photo with no small copy
// still answers it, with the full image.
func CoverThumbURL(alias string) string {
	return `COALESCE((SELECT '/api/stock/'||p.stock_id||'/image?size=thumb&v='||md5(p.object_key)
		FROM stock_photos p WHERE p.stock_id=` + alias + `.id AND p.position=1),'')`
}

// photoURL builds one photo's URL in SQL.
const photoURL = `'/api/stock/'||p.stock_id||'/photos/'||p.id||'?v='||md5(p.object_key)`

// PhotoList is the SQL for the id and URL of every photo, cover first.
func PhotoList(alias string) string {
	return `COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'url',` + photoURL + `)
		ORDER BY p.position) FROM stock_photos p WHERE p.stock_id=` + alias + `.id),'[]'::jsonb)`
}

// PhotoURLs is the SQL for just the URLs of every photo, cover first.
func PhotoURLs(alias string) string {
	return `ARRAY(SELECT ` + photoURL + ` FROM stock_photos p
		WHERE p.stock_id=` + alias + `.id ORDER BY p.position)`
}

// PhotoKey reads the file keys of one photo ("" means the cover): the full image
// and its small copy, which is "" for photos saved before small copies existed.
// The owner and staff always see it; everyone else only while the lot is in the
// market, which also means its seller is verified.
func (records *Store) PhotoKey(
	ctx context.Context,
	stockID, photoID, caller string,
	staff bool,
) (key, thumbKey string, err error) {
	err = records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT p.object_key, COALESCE(p.thumb_key,'') FROM stock_photos p
		JOIN stock s ON s.id=p.stock_id
		JOIN business_profiles u ON u.id=s.owner_id
		WHERE p.stock_id=$1 AND (($2='' AND p.position=1) OR p.id=$2) AND
		($4 OR s.owner_id=$3 OR (s.is_listed AND s.weight>0 AND u.role='business'
		AND NOT u.is_removed AND `+database.Verified("u")+`))`,
		stockID,
		photoID,
		caller,
		staff,
	).Scan(&key, &thumbKey)

	return key, thumbKey, err
}

// PhotoIDs lists a stock item's photo ids in order.
func (records *Store) PhotoIDs(ctx context.Context, stockID string) ([]string, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT id FROM stock_photos WHERE stock_id=$1 ORDER BY position`,
		stockID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		ids = append(ids, id)
	}

	return ids, rows.Err()
}

// PhotoKeys lists the file keys of every photo of a stock item, small copies
// included, so a delete removes both.
func (records *Store) PhotoKeys(ctx context.Context, stockID string) ([]string, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT k FROM stock_photos p, unnest(ARRAY[p.object_key, p.thumb_key]) AS k
		WHERE p.stock_id=$1 AND k IS NOT NULL`,
		stockID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}

		keys = append(keys, key)
	}

	return keys, rows.Err()
}

// AddPhoto puts a photo last. The caller holds the stock row lock and has
// checked the count, so positions stay 1..n.
func (records *Store) AddPhoto(ctx context.Context, stockID, id, key, thumbKey string) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO stock_photos (id, stock_id, position, object_key, thumb_key)
		SELECT $2, $1, COALESCE(max(position),0)+1, $3, $4 FROM stock_photos WHERE stock_id=$1`,
		stockID,
		id,
		key,
		thumbKey,
	)

	return err
}

// DeletePhoto removes one photo, closes the gap and returns its file keys (the
// full image, then its small copy when it has one). A missing photo is
// pgx.ErrNoRows.
func (records *Store) DeletePhoto(ctx context.Context, stockID, id string) ([]string, error) {
	var key, thumbKey string
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`DELETE FROM stock_photos WHERE stock_id=$1 AND id=$2
		RETURNING object_key, COALESCE(thumb_key,'')`,
		stockID,
		id,
	).Scan(&key, &thumbKey)
	if err != nil {
		return nil, err
	}

	_, err = records.db.Q(ctx).Exec(
		ctx,
		`UPDATE stock_photos p SET position=r.n
		FROM (SELECT id, row_number() OVER (ORDER BY position) AS n
			FROM stock_photos WHERE stock_id=$1) r
		WHERE p.id=r.id AND p.position<>r.n`,
		stockID,
	)

	keys := []string{key}
	if thumbKey != "" {
		keys = append(keys, thumbKey)
	}

	return keys, err
}

// OrderPhotos sets positions to the order of ids. The caller has checked that
// ids are exactly the current photos.
func (records *Store) OrderPhotos(ctx context.Context, stockID string, ids []string) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`UPDATE stock_photos p SET position=o.n
		FROM unnest($2::text[]) WITH ORDINALITY AS o(id, n)
		WHERE p.stock_id=$1 AND p.id=o.id`,
		stockID,
		ids,
	)

	return err
}
