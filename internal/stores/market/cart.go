package market

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// CartItem identifies a listed seller stock row. Display fields come from the database.
type CartItem struct {
	StockID      string `json:"stock_id"`
	MaterialID   string `json:"material_id"`
	MaterialName string `json:"material_name,omitempty"`
	Weight       string `json:"weight,omitempty"`
	Price        string `json:"price,omitempty"`
}

// Cart is the caller's cart for one seller.
type Cart struct {
	Items []CartItem `json:"items"`
}

// Cart reads current listed stock only, so stale carts cannot expose hidden inventory.
func (records *Store) Cart(ctx context.Context, buyer, seller string) (Cart, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT i.stock_id,i.material_id,m.name,i.weight::text,s.price::text
		FROM carts c JOIN cart_items i ON i.cart_id=c.id JOIN stock s ON s.id=i.stock_id
		JOIN materials m ON m.id=i.material_id JOIN users u ON u.id=c.seller_id
		WHERE c.buyer_id=$1 AND c.seller_id=$2 AND s.owner_id=c.seller_id
		AND s.material_id=i.material_id AND s.is_listed
		AND stock_available(s.id,s.weight)>0 AND NOT u.is_removed
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
		); err != nil {
			return cart, err
		}

		cart.Items = append(cart.Items, item)
	}

	return cart, rows.Err()
}

// ValidCartStock locks a matching available row until the cart write finishes.
func (records *Store) ValidCartStock(ctx context.Context, seller string, item CartItem) (bool, error) {
	var id string
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT s.id FROM stock s JOIN users u ON u.id=s.owner_id
		WHERE s.id=$1 AND s.material_id=$2 AND s.owner_id=$3 AND s.is_listed
		AND stock_available(s.id,s.weight)>0
		AND u.role='business' AND NOT u.is_removed FOR SHARE OF s,u`,
		item.StockID,
		item.MaterialID,
		seller,
	).Scan(
		&id,
	)

	return id != "", err
}

// ReplaceCart serializes concurrent edits with the buyer/seller unique constraint.
func (records *Store) ReplaceCart(ctx context.Context, buyer, seller string, items []CartItem) error {
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
		return err
	}

	if _, err := records.db.Q(ctx).Exec(ctx, `DELETE FROM cart_items WHERE cart_id=$1`, id); err != nil {
		return err
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
			return err
		}
	}

	return nil
}

// ClearCart deletes only a cart belonging to the caller.
func (records *Store) ClearCart(ctx context.Context, buyer, seller string) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`DELETE FROM carts WHERE buyer_id=$1 AND seller_id=$2`,
		buyer,
		seller,
	)

	return err
}
