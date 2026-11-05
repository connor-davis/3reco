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
	ID           string    `json:"id"`
	OwnerID      string    `json:"owner_id"`
	MaterialID   string    `json:"material_id"`
	MaterialName string    `json:"material_name"`
	Weight       string    `json:"weight"`
	Price        string    `json:"price"`
	BasePrice    string    `json:"base_price"`
	IsListed     bool      `json:"is_listed"`
	CreatedAt    time.Time `json:"created_at"`
}

// Store runs stock SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

const columns = `s.id,s.owner_id,s.material_id,m.name,s.weight::text,s.price::text,
	m.price::text,s.is_listed,s.created_at`

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
	)
}

// Find returns a row; lock serializes owner changes and trades.
func (records *Store) Find(ctx context.Context, id string, lock bool) (Item, error) {
	query := `SELECT ` + columns + ` FROM stock s JOIN materials m ON m.id=s.material_id WHERE s.id=$1`
	if lock {
		query += ` FOR UPDATE OF s FOR SHARE OF m`
	}

	var item Item
	err := scan(records.db.Q(ctx).QueryRow(ctx, query, id), &item)

	return item, err
}

// List returns owner stock in stable order.
func (records *Store) List(ctx context.Context, owner string, query paging.Query) ([]Item, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT `+columns+`
		FROM stock s JOIN materials m ON m.id=s.material_id
		WHERE s.owner_id=$1 AND ($2='' OR (s.created_at,s.id)<($3,$2))
		ORDER BY s.created_at DESC,s.id DESC LIMIT NULLIF($4,0)`,
		owner,
		query.ID,
		query.At,
		query.Size(),
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

// Create inserts unlisted stock for its caller.
func (records *Store) Create(ctx context.Context, item Item) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO stock(id,owner_id,material_id,weight,price)
		VALUES($1,$2,$3,$4::numeric,$5::numeric)`,
		item.ID,
		item.OwnerID,
		item.MaterialID,
		item.Weight,
		item.Price,
	)

	return err
}

// Update saves an already locked row, retaining owner scope in the write.
func (records *Store) Update(ctx context.Context, item Item) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`UPDATE stock SET weight=$3::numeric,price=$4::numeric,
		is_listed=$5,updated_at=now() WHERE id=$1 AND owner_id=$2`,
		item.ID,
		item.OwnerID,
		item.Weight,
		item.Price,
		item.IsListed,
	)

	return err
}

// Delete removes only the owner's row.
func (records *Store) Delete(ctx context.Context, id, owner string) error {
	_, err := records.db.Q(ctx).Exec(ctx, `DELETE FROM stock WHERE id=$1 AND owner_id=$2`, id, owner)

	return err
}
