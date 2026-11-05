// Package stats owns public marketplace aggregate SQL.
package stats

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// TopStore contains only a public store identity and its settled volume.
type TopStore struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	KG   string `json:"kg"`
}

// Summary contains exact community totals across settled trades.
type Summary struct {
	TotalKG   string     `json:"total_kg"`
	CO2KG     string     `json:"co2_kg"`
	Deals     int64      `json:"deals"`
	TopStores []TopStore `json:"top_stores"`
}

// Store runs public aggregate queries.
type Store struct{ db *database.DB }

// New builds the aggregate store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Summary reads totals and the five leading active business sellers.
func (records *Store) Summary(ctx context.Context) (Summary, error) {
	result := Summary{TopStores: []TopStore{}}
	err := records.db.Q(ctx).QueryRow(ctx, `
		SELECT COALESCE(sum(ti.weight),0)::text,
			COALESCE(sum(ti.weight*m.carbon_factor),0)::text,
			(SELECT count(*) FROM transactions)
		FROM transaction_items ti JOIN transactions t ON t.id=ti.transaction_id
		JOIN materials m ON m.id=ti.material_id`).Scan(
		&result.TotalKG,
		&result.CO2KG,
		&result.Deals,
	)
	if err != nil {
		return result, err
	}

	rows, err := records.db.Q(ctx).Query(ctx, `
		SELECT u.id, COALESCE(u.business_name,''), sum(ti.weight)::text
		FROM transactions t JOIN transaction_items ti ON ti.transaction_id=t.id
		JOIN users u ON u.id=t.seller_id AND u.role='business' AND NOT u.is_removed
		WHERE t.type='b2b' GROUP BY u.id,u.business_name
		ORDER BY sum(ti.weight) DESC,u.id ASC LIMIT 5`)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var item TopStore
		if err := rows.Scan(&item.ID, &item.Name, &item.KG); err != nil {
			return result, err
		}

		result.TopStores = append(result.TopStores, item)
	}

	return result, rows.Err()
}
