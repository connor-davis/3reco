// Package materials owns the material catalog SQL.
package materials

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Material is the public material catalog projection.
type Material struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	CarbonFactor string    `json:"carbon_factor"`
	GWCode       string    `json:"gw_code"`
	Price        string    `json:"price"`
	CreatedAt    time.Time `json:"created_at"`
}

// Store runs catalog SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Find reads one material, optionally locking it for a patch.
func (records *Store) Find(ctx context.Context, id string, lock bool) (Material, error) {
	query := `SELECT id,name,carbon_factor::text,gw_code,price::text,created_at
		FROM materials WHERE id=$1`
	if lock {
		query += ` FOR UPDATE`
	}

	var item Material
	err := records.db.Q(ctx).QueryRow(ctx, query, id).Scan(
		&item.ID,
		&item.Name,
		&item.CarbonFactor,
		&item.GWCode,
		&item.Price,
		&item.CreatedAt,
	)

	return item, err
}

// List reads the catalog in stable order.
func (records *Store) List(ctx context.Context, query paging.Query) ([]Material, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT id,name,carbon_factor::text,gw_code,price::text,created_at
		FROM materials WHERE ($1='' OR (created_at,id)<($2,$1)) AND ($4='' OR name ILIKE $4)
		ORDER BY created_at DESC,id DESC LIMIT NULLIF($3,0)`,
		query.ID,
		query.At,
		query.Size(),
		query.Like,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Material{}
	for rows.Next() {
		var item Material
		if err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.CarbonFactor,
			&item.GWCode,
			&item.Price,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	return items, rows.Err()
}

// Create inserts a catalog entry.
func (records *Store) Create(ctx context.Context, item Material) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO materials(id,name,carbon_factor,gw_code,price)
		VALUES($1,$2,$3::numeric,$4,$5::numeric)`,
		item.ID,
		item.Name,
		item.CarbonFactor,
		item.GWCode,
		item.Price,
	)

	return err
}

// Update saves a locked catalog entry.
func (records *Store) Update(ctx context.Context, item Material) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`UPDATE materials SET name=$2,carbon_factor=$3::numeric,
		gw_code=$4,price=$5::numeric,updated_at=now() WHERE id=$1`,
		item.ID,
		item.Name,
		item.CarbonFactor,
		item.GWCode,
		item.Price,
	)

	return err
}

// Delete leaves referenced materials protected by database foreign keys.
func (records *Store) Delete(ctx context.Context, id string) error {
	_, err := records.db.Q(ctx).Exec(ctx, `DELETE FROM materials WHERE id=$1`, id)

	return err
}
