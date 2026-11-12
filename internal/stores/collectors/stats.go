package collectors

import (
	"context"
	"github.com/connor-davis/3reco/internal/platform/database"
	"time"
)

// Totals holds exact collector totals without multiplying transaction revenue by item count.
type Totals struct {
	TotalRevenue     string `json:"total_revenue"`
	TotalVolume      string `json:"total_volume"`
	TransactionCount int    `json:"transaction_count"`
}

// Recent is a safe transaction summary for an authorized collector lookup.
type Recent struct {
	ID             string     `json:"id"`
	Type           string     `json:"type"`
	CreatedAt      time.Time  `json:"created_at"`
	CollectionDay  *string    `json:"collection_day"`
	CollectionDate *time.Time `json:"collection_date"`
	MaterialName   string     `json:"material_name"`
	Weight         string     `json:"weight"`
	Price          string     `json:"price"`
	BuyerName      string     `json:"buyer_name"`
	BuyerVerified  bool       `json:"buyer_verified"`
}

// Stats is a privileged collector aggregate.
type Stats struct {
	Collector          Collector `json:"collector"`
	Totals             Totals    `json:"totals"`
	CarbonSavings      string    `json:"carbon_savings"`
	LatestTransactions []Recent  `json:"latest_transactions"`
}

// Stats reads exact totals and recent collections for a scoped collector.
func (records *Store) Stats(ctx context.Context, item Collector) (Stats, error) {
	result := Stats{Collector: item, LatestTransactions: []Recent{}}
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT
		COALESCE((SELECT sum(total_price) FROM transactions WHERE status='complete' AND seller_id=$1 AND type='c2b'),0)::text,
		(SELECT count(*) FROM transactions WHERE status='complete' AND seller_id=$1 AND type='c2b'),
		COALESCE(sum(i.weight),0)::text,COALESCE(sum(i.weight*m.carbon_factor),0)::text
		FROM transactions t JOIN transaction_items i ON i.transaction_id=t.id
		JOIN materials m ON m.id=i.material_id WHERE t.status='complete' AND t.seller_id=$1 AND t.type='c2b'`,
		item.ID,
	).Scan(
		&result.Totals.TotalRevenue,
		&result.Totals.TransactionCount,
		&result.Totals.TotalVolume,
		&result.CarbonSavings,
	)
	if err != nil {
		return result, err
	}

	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT t.id,t.type,t.created_at,t.collection_day::text,
		t.collection_date,COALESCE((SELECT CASE WHEN count(*)=1 THEN min(m.name)
		ELSE count(*)::text||' materials' END FROM transaction_items i
		JOIN materials m ON m.id=i.material_id WHERE i.transaction_id=t.id),'Unknown'),
		COALESCE((SELECT sum(weight) FROM transaction_items WHERE transaction_id=t.id),0)::text,
		t.total_price::text,CASE WHEN u.is_removed THEN 'Unknown' ELSE
		`+database.DisplayName("u")+` END,
		`+database.Verified("u")+`
		FROM transactions t JOIN users u ON u.id=t.buyer_id WHERE t.status='complete' AND t.seller_id=$1 AND t.type='c2b'
		ORDER BY t.created_at DESC,t.id DESC LIMIT 5`,
		item.ID,
	)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var recent Recent
		if err := rows.Scan(
			&recent.ID,
			&recent.Type,
			&recent.CreatedAt,
			&recent.CollectionDay,
			&recent.CollectionDate,
			&recent.MaterialName,
			&recent.Weight,
			&recent.Price,
			&recent.BuyerName,
			&recent.BuyerVerified,
		); err != nil {
			return result, err
		}

		result.LatestTransactions = append(result.LatestTransactions, recent)
	}

	return result, rows.Err()
}
