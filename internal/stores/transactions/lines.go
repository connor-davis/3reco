package transactions

import (
	"context"
	"math/big"
	"slices"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// LineKey names one line by its material, weight and price as numbers, so 4
// and 4.00 are the same line. It is the Go side of database.SameLine.
func LineKey(item Item) string {
	weight, _ := new(big.Rat).SetString(item.Weight)
	price, _ := new(big.Rat).SetString(item.Price)

	return item.MaterialID + "|" + weight.RatString() + "|" + price.RatString()
}

// LineKeys is the sorted keys of all lines, repeated lines kept.
func LineKeys(items []Item) []string {
	keys := make([]string, len(items))
	for i, item := range items {
		keys[i] = LineKey(item)
	}

	slices.Sort(keys)

	return keys
}

// ContainedIn reports whether every inner line (counting repeats) is also an
// outer line, so the inner trade adds nothing the outer one does not hold.
func ContainedIn(inner, outer []string) bool {
	left := map[string]int{}
	for _, key := range outer {
		left[key]++
	}

	for _, key := range inner {
		if left[key] == 0 {
			return false
		}

		left[key]--
	}

	return len(inner) > 0
}

// CollectionMatches finds the buyer's complete collections from this seller
// that share at least one identical line with the new lines, newest first.
func (s *Store) CollectionMatches(
	ctx context.Context,
	buyerID, sellerID string,
	items []Item,
) ([]string, error) {
	materials, weights, prices := make([]string, len(items)), make([]string, len(items)), make([]string, len(items))
	for i, item := range items {
		materials[i], weights[i], prices[i] = item.MaterialID, item.Weight, item.Price
	}

	rows, err := s.db.Q(ctx).Query(ctx, `SELECT t.id FROM transactions t
		WHERE t.status='complete' AND t.type='c2b' AND t.buyer_id=$1 AND t.seller_id=$2
		AND EXISTS (SELECT 1 FROM transaction_items a JOIN (
			SELECT n.m AS material_id, n.w::numeric AS weight, n.p::numeric AS price
			FROM unnest($3::text[], $4::text[], $5::text[]) AS n(m, w, p)) b
			ON `+database.SameLine("a", "b")+` WHERE a.transaction_id=t.id)
		ORDER BY `+database.EffectiveDate("t")+` DESC, t.created_at DESC, t.id DESC LIMIT 20`,
		buyerID, sellerID, materials, weights, prices)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		out = append(out, id)
	}

	return out, rows.Err()
}
