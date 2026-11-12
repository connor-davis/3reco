package market

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// CartRoom reads how much of a locked stock row this buyer may still hold: what
// is free plus the buyer's own live hold, so a buyer can keep or raise their own line.
// Call it after LockCartStock, in a fresh statement.
func (records *Store) CartRoom(ctx context.Context, buyer, stockID string) (string, error) {
	var room string
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT trim_scale(stock_available(s.id,s.weight) + COALESCE((
			SELECT sum(h.weight) FROM stock_holds h JOIN carts c ON c.id=h.cart_id
			WHERE h.stock_id=s.id AND c.buyer_id=$2 AND h.status='active'
			AND h.expires_at>clock_timestamp()), 0))::text
		FROM stock s WHERE s.id=$1`,
		stockID,
		buyer,
	).Scan(&room)

	return room, err
}

// HoldCartLine sets the cart line's hold to the line's weight. A live hold keeps its
// end time, so editing a line cannot hold stock forever; a missing or ended one gets a
// fresh lifetime. The stock row must already be locked.
func (records *Store) HoldCartLine(
	ctx context.Context,
	cartID, buyer, seller string,
	item CartItem,
	lifetime time.Duration,
) error {
	// An ended hold the sweeper has not reached yet would block the new one.
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`UPDATE stock_holds SET status='released', released_at=clock_timestamp()
		WHERE cart_id=$1 AND stock_id=$2 AND status='active' AND expires_at<=clock_timestamp()`,
		cartID,
		item.StockID,
	)
	if err != nil {
		return err
	}

	tag, err := records.db.Q(ctx).Exec(
		ctx,
		`UPDATE stock_holds SET weight=$3::numeric
		WHERE cart_id=$1 AND stock_id=$2 AND status='active'`,
		cartID,
		item.StockID,
		item.Weight,
	)
	if err != nil || tag.RowsAffected() == 1 {
		return err
	}

	_, err = records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO stock_holds(id,cart_id,stock_id,seller_id,buyer_id,weight,expires_at)
		VALUES($1,$2,$3,$4,$5,$6::numeric,clock_timestamp()+$7::double precision * interval '1 second')`,
		database.NewID(),
		cartID,
		item.StockID,
		seller,
		buyer,
		item.Weight,
		lifetime.Seconds(),
	)

	return err
}

// ReleaseOtherHolds frees the holds of lines that left the cart.
func (records *Store) ReleaseOtherHolds(ctx context.Context, cartID string, keep []string) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`UPDATE stock_holds SET status='released', released_at=clock_timestamp()
		WHERE cart_id=$1 AND status='active' AND (stock_id IS NULL OR stock_id<>ALL($2))`,
		cartID,
		keep,
	)

	return err
}

// ExpiredCart is what one cart lost when its holds ran out.
type ExpiredCart struct {
	BuyerID    string
	SellerID   string
	SellerName string
	Materials  []string
}

// ExpireCartHolds locks a bounded batch of carts, skipping carts another worker or a
// buyer's save owns. It frees the ended holds, removes their lines and any cart left
// empty. Its caller keeps the transaction open through the buyers' notifications.
func (records *Store) ExpireCartHolds(ctx context.Context) ([]ExpiredCart, error) {
	candidates, err := records.db.Q(ctx).Query(ctx, `
		SELECT c.id FROM carts c WHERE EXISTS (
			SELECT 1 FROM stock_holds h WHERE h.cart_id=c.id
			AND h.status='active' AND h.expires_at<=clock_timestamp())
		ORDER BY c.id LIMIT 100 FOR UPDATE OF c SKIP LOCKED`)
	if err != nil {
		return nil, err
	}

	var ids []string
	for candidates.Next() {
		var id string
		if err := candidates.Scan(&id); err != nil {
			candidates.Close()

			return nil, err
		}

		ids = append(ids, id)
	}

	candidates.Close()
	if err := candidates.Err(); err != nil {
		return nil, err
	}

	if len(ids) == 0 {
		return nil, nil
	}

	// Recheck in a fresh statement after the cart locks: a line the buyer just saved
	// again is no longer expired and must stay.
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`WITH expired AS MATERIALIZED (
			SELECT h.id, h.cart_id, h.stock_id FROM stock_holds h
			WHERE h.cart_id=ANY($1) AND h.status='active' AND h.expires_at<=clock_timestamp()
		), released AS (
			UPDATE stock_holds SET status='released', released_at=clock_timestamp()
			WHERE id IN (SELECT id FROM expired)
		), removed AS (
			DELETE FROM cart_items i USING expired e
			WHERE i.cart_id=e.cart_id AND i.stock_id=e.stock_id
			RETURNING i.cart_id, i.material_id
		)
		SELECT c.buyer_id, c.seller_id, `+database.DisplayName("u")+`,
			array_agg(DISTINCT m.name ORDER BY m.name)
		FROM removed r JOIN carts c ON c.id=r.cart_id JOIN users u ON u.id=c.seller_id
		JOIN materials m ON m.id=r.material_id
		GROUP BY c.id, c.buyer_id, c.seller_id, u.id ORDER BY c.id`,
		ids,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var expired []ExpiredCart
	for rows.Next() {
		var cart ExpiredCart
		if err := rows.Scan(&cart.BuyerID, &cart.SellerID, &cart.SellerName, &cart.Materials); err != nil {
			return nil, err
		}

		expired = append(expired, cart)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows.Close()

	_, err = records.db.Q(ctx).Exec(
		ctx,
		`DELETE FROM carts c WHERE c.id=ANY($1)
		AND NOT EXISTS (SELECT 1 FROM cart_items i WHERE i.cart_id=c.id)`,
		ids,
	)

	return expired, err
}
