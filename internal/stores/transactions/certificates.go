package transactions

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// effectiveDay is the Africa/Johannesburg day a trade counts on, as in every list.
var effectiveDay = database.EffectiveDate("t")

// ImpactLine is one material's weights over some completed trades. Bought and Sold are
// from the owner's side, and Carbon is weight times the material's carbon factor
// today. All three are exact decimal strings straight from Postgres numeric.
type ImpactLine struct {
	Material string `json:"material"`
	Bought   string `json:"bought"`
	Sold     string `json:"sold"`
	Carbon   string `json:"carbon"`
}

// impactSQL groups completed trade items by material. $1 is the owner's party id, so a
// trade the owner is not the buyer of counts as sold. The caller adds the WHERE tail.
const impactSQL = `
	SELECT m.name,
		COALESCE(sum(i.weight) FILTER (WHERE t.buyer_id = $1), 0)::text,
		COALESCE(sum(i.weight) FILTER (WHERE t.buyer_id <> $1), 0)::text,
		COALESCE(sum(i.weight * m.carbon_factor), 0)::text
	FROM transactions t
	JOIN transaction_items i ON i.transaction_id = t.id
	JOIN materials m ON m.id = i.material_id
	WHERE t.status = 'complete' AND `

const impactTail = ` GROUP BY m.id, m.name ORDER BY m.name, m.id`

// TradeImpact groups one completed trade's items by material, from the owner's side.
func (s *Store) TradeImpact(ctx context.Context, id, owner string) ([]ImpactLine, error) {
	return s.impact(ctx, `t.id = $2`, owner, id)
}

// PeriodImpact groups the owner's completed trades on effective days in [from, to) by
// material. The scope is one of the fixed clauses on $1, never caller text.
func (s *Store) PeriodImpact(
	ctx context.Context,
	scope Scope,
	owner string,
	from, to time.Time,
) ([]ImpactLine, error) {
	clause := `(` + scopeSQL[scope] + `) AND ` + effectiveDay + ` >= $2 AND ` + effectiveDay + ` < $3`

	return s.impact(ctx, clause, owner, from, to)
}

func (s *Store) impact(
	ctx context.Context,
	clause, owner string,
	args ...any,
) ([]ImpactLine, error) {
	rows, err := s.db.Q(ctx).Query(ctx, impactSQL+clause+impactTail, append([]any{owner}, args...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []ImpactLine

	for rows.Next() {
		var line ImpactLine

		if err := rows.Scan(&line.Material, &line.Bought, &line.Sold, &line.Carbon); err != nil {
			return nil, err
		}

		lines = append(lines, line)
	}

	return lines, rows.Err()
}
