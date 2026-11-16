package stats

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// PriceWeek is a weekly aggregate with no trade or party identities or counts.
type PriceWeek struct {
	Period   string  `json:"period"`
	AvgPrice *string `json:"avg_price"`
	Status   string  `json:"status"`
}

// PriceHistory reads twelve Monday-start UTC weeks, including the current week.
// Item prices are per kg; numeric arithmetic is rounded half up to cents only
// after weighting. Suppression happens in SQL, before any price leaves the store.
func (records *Store) PriceHistory(
	ctx context.Context,
	materialID string,
	minimumDeals, minimumStores int,
) ([]PriceWeek, error) {
	var exists bool
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM materials WHERE id=$1)`,
		materialID,
	).Scan(&exists)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, pgx.ErrNoRows
	}

	rows, err := records.db.Q(ctx).Query(ctx, `
		WITH bounds AS (
			SELECT date_trunc('week', now() AT TIME ZONE 'UTC') AS current_week
		), weeks AS (
			SELECT generate_series(current_week - interval '11 weeks', current_week,
				interval '1 week') AS period FROM bounds
		), totals AS (
			SELECT date_trunc('week', t.created_at AT TIME ZONE 'UTC') AS period,
				count(DISTINCT t.id) AS deals, count(DISTINCT t.seller_id) AS stores,
				sum(ti.weight * ti.price) AS value, sum(ti.weight) AS weight
			FROM transactions t
			JOIN transaction_items ti ON ti.transaction_id=t.id
			JOIN businesses seller ON seller.id=t.seller_id
			JOIN businesses buyer ON buyer.id=t.buyer_id
			CROSS JOIN bounds
			WHERE ti.material_id=$1 AND t.type='b2b' AND t.status='complete'
				AND ti.weight>0 AND ti.price>=0
				AND t.created_at >= (current_week - interval '11 weeks') AT TIME ZONE 'UTC'
				AND t.created_at <= now()
			GROUP BY 1
		)
		SELECT to_char(w.period, 'YYYY-MM-DD'),
			CASE WHEN a.deals >= $2 AND a.stores >= $3
				THEN round(a.value / NULLIF(a.weight, 0), 2)::text END,
			CASE WHEN a.deals >= $2 AND a.stores >= $3
				THEN 'available' ELSE 'not_enough_deals' END
		FROM weeks w LEFT JOIN totals a ON a.period=w.period ORDER BY w.period`,
		materialID, minimumDeals, minimumStores)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	weeks := []PriceWeek{}
	for rows.Next() {
		var week PriceWeek
		if err := rows.Scan(&week.Period, &week.AvgPrice, &week.Status); err != nil {
			return nil, err
		}

		weeks = append(weeks, week)
	}

	return weeks, rows.Err()
}
