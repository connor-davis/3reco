package admin

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/jackc/pgx/v5"
)

// MaterialWeight is a material and an exact kg total.
type MaterialWeight struct {
	MaterialID string `json:"material_id"`
	Name       string `json:"name"`
	Weight     string `json:"weight"`
}

// Week is a business's collected kg this week and last week, plus the top
// materials collected this week.
type Week struct {
	ThisKg    string           `json:"this_kg"`
	LastKg    string           `json:"last_kg"`
	Materials []MaterialWeight `json:"materials"`
}

// ActiveCollectors counts the distinct collectors with a complete collection
// in [from, to). The scope keeps a business to the collections it bought.
func (s *Store) ActiveCollectors(
	ctx context.Context,
	scope Scope,
	owner string,
	from, to time.Time,
) (int, error) {
	var n int

	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT count(DISTINCT t.seller_id)
		FROM transactions t
		JOIN collectors c ON c.id = t.seller_id
		WHERE t.status='complete' AND t.type='c2b' AND `+string(scope)+`
			AND `+database.EffectiveDate("t")+` >= $2
			AND `+database.EffectiveDate("t")+` < $3`, owner, from, to).Scan(&n)

	return n, err
}

// StockMix sums current stock kg by material, biggest first. An empty owner
// means every business (admin, staff).
func (s *Store) StockMix(ctx context.Context, owner string) ([]MaterialWeight, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT m.id, m.name, sum(s.weight)::text
		FROM stock s JOIN materials m ON m.id = s.material_id
		WHERE ($1 = '' OR s.owner_id = $1) AND s.weight > 0
		GROUP BY m.id, m.name
		ORDER BY sum(s.weight) DESC, m.name`, owner)
	if err != nil {
		return nil, err
	}

	return scanMaterials(rows)
}

// CollectedWeek adds up the kg of a business's complete collections in this
// week and last week, and lists the top four materials this week. Weeks run
// Monday to Monday, starting at lastStart, thisStart and ending at now.
func (s *Store) CollectedWeek(
	ctx context.Context,
	owner string,
	lastStart, thisStart, now time.Time,
) (Week, error) {
	week := Week{Materials: []MaterialWeight{}}

	err := s.db.Q(ctx).QueryRow(ctx, `
		WITH tx AS (
			SELECT t.id, `+database.EffectiveDate("t")+` AS at
			FROM transactions t
			WHERE t.status='complete' AND t.type='c2b' AND t.buyer_id = $1
		)
		SELECT
			COALESCE(sum(i.weight) FILTER (WHERE tx.at >= $3 AND tx.at < $4), 0)::text,
			COALESCE(sum(i.weight) FILTER (WHERE tx.at >= $2 AND tx.at < $3), 0)::text
		FROM tx JOIN transaction_items i ON i.transaction_id = tx.id
		WHERE tx.at >= $2 AND tx.at < $4`, owner, lastStart, thisStart, now).
		Scan(&week.ThisKg, &week.LastKg)
	if err != nil {
		return week, err
	}

	rows, err := s.db.Q(ctx).Query(ctx, `
		WITH tx AS (
			SELECT t.id, `+database.EffectiveDate("t")+` AS at
			FROM transactions t
			WHERE t.status='complete' AND t.type='c2b' AND t.buyer_id = $1
		)
		SELECT m.id, m.name, sum(i.weight)::text
		FROM tx
		JOIN transaction_items i ON i.transaction_id = tx.id
		JOIN materials m ON m.id = i.material_id
		WHERE tx.at >= $2 AND tx.at < $3
		GROUP BY m.id, m.name
		ORDER BY sum(i.weight) DESC, m.name
		LIMIT 4`, owner, thisStart, now)
	if err != nil {
		return week, err
	}

	week.Materials, err = scanMaterials(rows)

	return week, err
}

func scanMaterials(rows pgx.Rows) ([]MaterialWeight, error) {
	defer rows.Close()

	out := []MaterialWeight{}

	for rows.Next() {
		var m MaterialWeight

		if err := rows.Scan(&m.MaterialID, &m.Name, &m.Weight); err != nil {
			return nil, err
		}

		out = append(out, m)
	}

	return out, rows.Err()
}
