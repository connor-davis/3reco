package market

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// CartItem identifies a listed seller stock row. Display fields come from the database.
type CartItem struct {
	StockID      string `json:"stock_id"`
	MaterialID   string `json:"material_id"`
	MaterialName string `json:"material_name,omitempty"`
	Weight       string `json:"weight,omitempty"`
	Price        string `json:"price,omitempty"`
	// ReservedUntil is when this line's 48-hour stock hold ends; the server sets it.
	ReservedUntil *time.Time `json:"reserved_until,omitempty"`
}

// CartStore is a seller with materials saved in the caller's cart.
type CartStore struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ItemCount int    `json:"item_count"`
}

// CartStores lists only the caller's nonempty carts with visible materials.
func (records *Store) CartStores(ctx context.Context, buyer string) ([]CartStore, error) {
	rows, err := records.db.Q(ctx).Query(ctx, `SELECT u.id, `+database.DisplayName("u")+`, count(*)
        FROM carts c JOIN cart_items i ON i.cart_id=c.id JOIN stock s ON s.id=i.stock_id
        JOIN users u ON u.id=c.seller_id
        LEFT JOIN stock_holds h ON h.cart_id=c.id AND h.stock_id=i.stock_id
        AND h.status='active' AND h.expires_at>clock_timestamp()
        WHERE c.buyer_id=$1 AND NOT u.is_removed
        AND s.owner_id=u.id AND s.material_id=i.material_id AND s.is_listed
        AND stock_available(s.id,s.weight)+COALESCE(h.weight,0)>0
        GROUP BY u.id, `+database.DisplayName("u")+` ORDER BY 2,1`, buyer)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []CartStore{}
	for rows.Next() {
		var item CartStore
		if err := rows.Scan(&item.ID, &item.Name, &item.ItemCount); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// Cart is the caller's cart for one seller.
type Cart struct {
	Items []CartItem `json:"items"`
}

// Cart reads current listed stock only, so stale carts cannot expose hidden inventory.
func (records *Store) Cart(ctx context.Context, buyer, seller string) (Cart, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT i.stock_id,i.material_id,m.name,i.weight::text,s.price::text,h.expires_at
		FROM carts c JOIN cart_items i ON i.cart_id=c.id JOIN stock s ON s.id=i.stock_id
		JOIN materials m ON m.id=i.material_id JOIN users u ON u.id=c.seller_id
		LEFT JOIN stock_holds h ON h.cart_id=c.id AND h.stock_id=i.stock_id
		AND h.status='active' AND h.expires_at>clock_timestamp()
		WHERE c.buyer_id=$1 AND c.seller_id=$2 AND s.owner_id=c.seller_id
		AND s.material_id=i.material_id AND s.is_listed
		AND stock_available(s.id,s.weight)+COALESCE(h.weight,0)>0 AND NOT u.is_removed
		ORDER BY i.stock_id`,
		buyer,
		seller,
	)
	if err != nil {
		return Cart{}, err
	}
	defer rows.Close()

	cart := Cart{Items: []CartItem{}}
	for rows.Next() {
		var item CartItem
		if err := rows.Scan(
			&item.StockID,
			&item.MaterialID,
			&item.MaterialName,
			&item.Weight,
			&item.Price,
			&item.ReservedUntil,
		); err != nil {
			return cart, err
		}

		cart.Items = append(cart.Items, item)
	}

	return cart, rows.Err()
}

// LockCartStock takes the row lock that serializes every reservation of one stock
// row. It fails with pgx.ErrNoRows when the row is not a listed row of this seller.
// Availability is read by a later statement, so it sees what the lock waited for.
func (records *Store) LockCartStock(ctx context.Context, seller string, item CartItem) error {
	var id string

	return records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT s.id FROM stock s JOIN users u ON u.id=s.owner_id
		WHERE s.id=$1 AND s.material_id=$2 AND s.owner_id=$3 AND s.is_listed
		AND u.role='business' AND NOT u.is_removed FOR UPDATE OF s FOR SHARE OF u`,
		item.StockID,
		item.MaterialID,
		seller,
	).Scan(&id)
}

// ReplaceCart rewrites the cart's lines and returns its id. The buyer/seller
// unique constraint serializes concurrent edits.
func (records *Store) ReplaceCart(
	ctx context.Context,
	buyer, seller string,
	items []CartItem,
) (string, error) {
	var id string
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`INSERT INTO carts(id,buyer_id,seller_id) VALUES($1,$2,$3)
		ON CONFLICT(buyer_id,seller_id) DO UPDATE SET updated_at=now() RETURNING id`,
		database.NewID(),
		buyer,
		seller,
	).Scan(
		&id,
	)
	if err != nil {
		return "", err
	}

	if _, err := records.db.Q(ctx).Exec(ctx, `DELETE FROM cart_items WHERE cart_id=$1`, id); err != nil {
		return "", err
	}

	for _, item := range items {
		_, err := records.db.Q(ctx).Exec(
			ctx,
			`INSERT INTO cart_items(cart_id,stock_id,material_id,weight) VALUES($1,$2,$3,$4::numeric)`,
			id,
			item.StockID,
			item.MaterialID,
			item.Weight,
		)
		if err != nil {
			return "", err
		}
	}

	return id, nil
}

// ClearCart releases the holds of only a cart belonging to the caller, then deletes it.
// It locks the held stock rows first, in id order, like SaveCart, so the two never deadlock.
func (records *Store) ClearCart(ctx context.Context, buyer, seller string) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`SELECT id FROM stock WHERE id IN (
			SELECT h.stock_id FROM stock_holds h JOIN carts c ON c.id=h.cart_id
			WHERE c.buyer_id=$1 AND c.seller_id=$2 AND h.status='active')
		ORDER BY id FOR UPDATE`,
		buyer,
		seller,
	)
	if err != nil {
		return err
	}

	_, err = records.db.Q(ctx).Exec(
		ctx,
		`UPDATE stock_holds SET status='released', released_at=clock_timestamp()
		WHERE status='active' AND cart_id IN (
			SELECT id FROM carts WHERE buyer_id=$1 AND seller_id=$2)`,
		buyer,
		seller,
	)
	if err != nil {
		return err
	}

	_, err = records.db.Q(ctx).Exec(
		ctx,
		`DELETE FROM carts WHERE buyer_id=$1 AND seller_id=$2`,
		buyer,
		seller,
	)

	return err
}
