package admin

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Scope is which transactions a dashboard counts. The clauses are fixed SQL
// text, never built from input; $1 is the owner id.
type Scope string

// The dashboards.
const (
	// ScopeEverything counts every transaction (admin and staff).
	ScopeEverything Scope = `$1::text IS NOT NULL`
	// ScopeBusiness counts a business's purchases and its own business sales.
	ScopeBusiness Scope = `(t.buyer_id = $1 OR (t.type = 'b2b' AND t.seller_id = $1))`
	// ScopeCollector counts a collector row's sales.
	ScopeCollector Scope = `(t.type = 'c2b' AND t.seller_id = $1)`
)

// Day is one day of the series. Day is the South African calendar date.
type Day struct {
	Day    string `json:"day"`
	Count  int    `json:"count"`
	Value  string `json:"value"`
	Weight string `json:"weight"`
	Carbon string `json:"carbon_savings"`
}

// Counterparty is the other side of a trade: the seller of a purchase or the
// buyer of a sale.
type Counterparty struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Verified bool   `json:"business_verified"`
	Count    int    `json:"count"`
	Value    string `json:"value"`
}

// TypeTotal is the settled trades of one type (c2b or b2b) in a window.
type TypeTotal struct {
	Type   string `json:"type"`
	Count  int    `json:"count"`
	Weight string `json:"weight"`
}

// RoleCount is how many live users hold a role.
type RoleCount struct {
	Role  string `json:"role"`
	Count int    `json:"count"`
}

// Days returns one row per South African day that has transactions in
// [from, to). The service fills the empty days.
func (s *Store) Days(
	ctx context.Context,
	scope Scope,
	owner string,
	from, to time.Time,
) ([]Day, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		WITH tx AS (
			SELECT t.id, t.total_price, `+database.EffectiveDate("t")+` AS at
			FROM transactions t WHERE t.status='complete' AND `+string(scope)+`
		)
		SELECT to_char(tx.at AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD') AS day,
			count(*), sum(tx.total_price)::text,
			COALESCE(sum(x.w), 0)::text, COALESCE(sum(x.c), 0)::text
		FROM tx
		LEFT JOIN LATERAL (
			SELECT sum(i.weight) AS w, sum(i.weight * m.carbon_factor) AS c
			FROM transaction_items i JOIN materials m ON m.id = i.material_id
			WHERE i.transaction_id = tx.id
		) x ON true
		WHERE tx.at >= $2 AND tx.at < $3
		GROUP BY day ORDER BY day`, owner, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Day

	for rows.Next() {
		var d Day

		if err := rows.Scan(&d.Day, &d.Count, &d.Value, &d.Weight, &d.Carbon); err != nil {
			return nil, err
		}

		out = append(out, d)
	}

	return out, rows.Err()
}

// Counterparties returns the ten biggest other sides of the owner's trades in
// [from, to). A purchase names its seller and a sale names its buyer, so a
// partner counts what it sold to the owner plus what it bought. With no owner
// (admin, staff) every trade counts for both its buyer and its seller. A
// collector seller shows the collector's name.
func (s *Store) Counterparties(
	ctx context.Context,
	scope Scope,
	owner string,
	from, to time.Time,
) ([]Counterparty, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		WITH tx AS (
			SELECT t.type, t.buyer_id, t.seller_id, t.total_price,
				t.collection_day, t.collection_date, t.created_at, `+database.EffectiveDate("t")+` AS at
			FROM transactions t WHERE t.status='complete' AND `+string(scope)+`
		)
		SELECT cp.id, cp.name, cp.verified, count(*), sum(tx.total_price)::text
		FROM tx
		LEFT JOIN business_profiles seller ON seller.id = tx.seller_id AND tx.type = 'b2b'
		LEFT JOIN collectors col ON col.id = tx.seller_id AND tx.type = 'c2b'
		JOIN business_profiles buyer ON buyer.id = tx.buyer_id
		CROSS JOIN LATERAL (
			SELECT tx.seller_id AS id, COALESCE(col.name, `+database.DisplayName("seller")+`) AS name,
				`+database.Verified("seller")+` AS verified
			WHERE $1 = '' OR tx.buyer_id = $1
			UNION ALL
			SELECT tx.buyer_id, `+database.DisplayName("buyer")+`, `+database.Verified("buyer")+`
			WHERE $1 = '' OR tx.buyer_id <> $1
		) cp
		WHERE tx.at >= $2 AND tx.at < $3
		GROUP BY cp.id, cp.name, cp.verified
		ORDER BY sum(tx.total_price) DESC, cp.id
		LIMIT 10`, owner, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Counterparty{}

	for rows.Next() {
		var c Counterparty

		if err := rows.Scan(&c.ID, &c.Name, &c.Verified, &c.Count, &c.Value); err != nil {
			return nil, err
		}

		out = append(out, c)
	}

	return out, rows.Err()
}

// RoleCounts counts the users who have not been removed, by role.
func (s *Store) RoleCounts(ctx context.Context) ([]RoleCount, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT role, count(*) FROM users
		WHERE NOT is_removed AND role IS NOT NULL GROUP BY role ORDER BY role`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []RoleCount{}

	for rows.Next() {
		var r RoleCount

		if err := rows.Scan(&r.Role, &r.Count); err != nil {
			return nil, err
		}

		out = append(out, r)
	}

	return out, rows.Err()
}

// TypeTotals counts every transaction in [from, to) and its kg, by type.
func (s *Store) TypeTotals(ctx context.Context, from, to time.Time) ([]TypeTotal, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT t.type, count(*), COALESCE(sum(x.w), 0)::text
		FROM transactions t
		LEFT JOIN LATERAL (
			SELECT sum(i.weight) AS w FROM transaction_items i WHERE i.transaction_id = t.id
		) x ON true
		WHERE t.status='complete' AND `+database.EffectiveDate("t")+` >= $1 AND `+database.EffectiveDate("t")+` < $2
		GROUP BY t.type ORDER BY t.type`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []TypeTotal{}

	for rows.Next() {
		var r TypeTotal

		if err := rows.Scan(&r.Type, &r.Count, &r.Weight); err != nil {
			return nil, err
		}

		out = append(out, r)
	}

	return out, rows.Err()
}
