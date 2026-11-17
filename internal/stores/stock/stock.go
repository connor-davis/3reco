// Package stock owns stock SQL and its safe row projection.
package stock

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Item is a stock row with its material's safe catalog fields.
type Item struct {
	FulfillmentMode string    `json:"fulfillment_mode"`
	PickupArea      string    `json:"pickup_area"`
	ImageURL        string    `json:"image_url"`
	Photos          []Photo   `json:"photos"`
	ID              string    `json:"id"`
	OwnerID         string    `json:"owner_id"`
	MaterialID      string    `json:"material_id"`
	MaterialName    string    `json:"material_name"`
	Weight          string    `json:"weight"`
	AvailableWeight string    `json:"available_weight"`
	Price           string    `json:"price"`
	BasePrice       string    `json:"base_price"`
	IsListed        bool      `json:"is_listed"`
	CreatedAt       time.Time `json:"created_at"`
}

// Store runs stock SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

var columns = `s.id,s.owner_id,s.material_id,m.name,s.weight::text,s.price::text,
	m.price::text,s.is_listed,s.created_at,stock_available(s.id,s.weight)::text,
	` + CoverURL("s") + `,` + PhotoList("s") + `,COALESCE(s.fulfillment_mode,''),COALESCE(s.pickup_area,'')`

func scan(row pgx.Row, item *Item) error {
	return row.Scan(
		&item.ID,
		&item.OwnerID,
		&item.MaterialID,
		&item.MaterialName,
		&item.Weight,
		&item.Price,
		&item.BasePrice,
		&item.IsListed,
		&item.CreatedAt,
		&item.AvailableWeight,
		&item.ImageURL,
		&item.Photos,
		&item.FulfillmentMode,
		&item.PickupArea,
	)
}

// Held reads current reservations after the caller has locked the stock row.
func (records *Store) Held(ctx context.Context, id string) (string, error) {
	var held string
	err := records.db.Q(ctx).QueryRow(ctx, `SELECT stock_held($1)::text`, id).Scan(&held)

	return held, err
}

// Find returns a row; lock serializes owner changes and trades.
func (records *Store) Find(ctx context.Context, id string, lock bool, caller ...string) (Item, error) {
	query := `SELECT ` + columns + ` FROM stock s JOIN materials m ON m.id=s.material_id WHERE s.id=$1`
	args := []any{id}
	if len(caller) > 0 {
		query += ` AND (s.owner_id=$2 OR (s.is_listed AND EXISTS(
			SELECT 1 FROM businesses b WHERE b.id=s.owner_id AND NOT b.is_removed)))`
		args = append(args, caller[0])
	}

	if lock {
		query += ` FOR UPDATE OF s FOR SHARE OF m`
	}

	var item Item
	err := scan(records.db.Q(ctx).QueryRow(ctx, query, args...), &item)

	return item, err
}

// List returns owner stock in stable order. listed is "", "listed" or "unlisted".
func (records *Store) List(
	ctx context.Context,
	owner string,
	query paging.Query,
	listed string,
) ([]Item, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT `+columns+`
		FROM stock s JOIN materials m ON m.id=s.material_id
		WHERE s.owner_id=$1 AND ($2='' OR (s.created_at,s.id)<($3,$2))
		AND ($5='' OR m.name ILIKE $5)
		AND ($6='' OR s.is_listed=($6='listed'))
		ORDER BY s.created_at DESC,s.id DESC LIMIT NULLIF($4,0)`,
		owner,
		query.ID,
		query.At,
		query.Size(),
		query.Like,
		listed,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Item{}
	for rows.Next() {
		var item Item
		if err := scan(rows, &item); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	return items, rows.Err()
}

// BasePrice locks a material against concurrent price changes during creation.
func (records *Store) BasePrice(ctx context.Context, id string) (string, error) {
	var price string
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT price::text FROM materials WHERE id=$1 FOR SHARE`,
		id,
	).Scan(
		&price,
	)

	return price, err
}

// Create inserts stock for its caller, listed only when the item says so. It
// reports true when the row is published for the first time.
func (records *Store) Create(ctx context.Context, item Item) (bool, error) {
	var first bool

	err := records.db.Q(ctx).QueryRow(
		ctx,
		`INSERT INTO stock(id,owner_id,material_id,weight,price,is_listed,fulfillment_mode,pickup_area,
			first_listed_at)
		VALUES($1,$2,$3,$4::numeric,$5::numeric,$6,NULLIF($7,''),NULLIF($8,''),
			CASE WHEN $6 AND $4::numeric>0 THEN now() END)
		RETURNING first_listed_at IS NOT NULL`,
		item.ID,
		item.OwnerID,
		item.MaterialID,
		item.Weight,
		item.Price,
		item.IsListed,
		item.FulfillmentMode,
		item.PickupArea,
	).Scan(&first)

	return first, err
}

// Update saves an already locked row, retaining owner scope in the write. It
// reports true when this save is the row's first time on the market.
func (records *Store) Update(ctx context.Context, item Item) (bool, error) {
	var first bool

	err := records.db.Q(ctx).QueryRow(
		ctx,
		`WITH before AS (SELECT first_listed_at FROM stock WHERE id=$1 AND owner_id=$2)
		UPDATE stock SET weight=$3::numeric,price=$4::numeric,
		is_listed=$5,fulfillment_mode=NULLIF($6,''),pickup_area=NULLIF($7,''),
		first_listed_at=COALESCE(first_listed_at,CASE WHEN $5 AND $3::numeric>0 THEN now() END),
		updated_at=now() WHERE id=$1 AND owner_id=$2
		RETURNING (SELECT first_listed_at FROM before) IS NULL AND first_listed_at IS NOT NULL`,
		item.ID,
		item.OwnerID,
		item.Weight,
		item.Price,
		item.IsListed,
		item.FulfillmentMode,
		item.PickupArea,
	).Scan(&first)

	return first, err
}

// TellFollowers writes one in-app alert for every person who follows the
// seller of a row that was just published. It joins the caller's transaction,
// so a save that rolls back tells nobody. Only people get a row, never the
// store's team. A store that is not verified yet stays quiet.
func (records *Store) TellFollowers(ctx context.Context, id string) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO notifications (id,user_id,type,title,body,link)
		SELECT md5(random()::text||f.user_id||s.id),f.user_id,'store_new_listing',
			`+database.DisplayName("u")+`||' has a new listing',
			m.name||' at R '||s.price::text||' per kg','/market/listing/'||s.id
		FROM stock s JOIN materials m ON m.id=s.material_id
		JOIN business_profiles u ON u.id=s.owner_id
		JOIN follows f ON f.store_id=s.owner_id
		JOIN users person ON person.id=f.user_id AND NOT person.is_removed
		WHERE s.id=$1 AND s.is_listed AND s.weight>0
		AND NOT u.is_removed AND u.role='business' AND person_contact_allowed(person.id,u.id) AND `+database.Verified("u"),
		id,
	)

	return err
}

// Delete removes only the owner's row.
func (records *Store) Delete(ctx context.Context, id, owner string) error {
	_, err := records.db.Q(ctx).Exec(ctx, `DELETE FROM stock WHERE id=$1 AND owner_id=$2`, id, owner)

	return err
}
