package market

import (
	"context"
	"errors"
	"sort"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	store "github.com/connor-davis/3reco/internal/stores/market"
)

func cartParties(buyer, seller string) error {
	if buyer == "" {
		return apperr.Unauthorized("Please sign in.")
	}

	if seller == "" || buyer == seller {
		return apperr.Field("seller_id", "Choose another seller.")
	}

	return nil
}

// Cart reads only the caller's cart; buyer IDs never come from the request.
func (service *Service) Cart(ctx context.Context, buyer, seller string) (store.Cart, error) {
	if err := cartParties(buyer, seller); err != nil {
		return store.Cart{}, err
	}

	return service.store.Cart(ctx, buyer, seller)
}

// SaveCart validates every stock/material/seller combination before changing the cart.
func (service *Service) SaveCart(ctx context.Context, buyer, seller string, items []store.CartItem) error {
	if err := cartParties(buyer, seller); err != nil {
		return err
	}

	if len(items) > 200 {
		return apperr.Field("items", "Choose at most 200 items.")
	}

	// Consistent lock order keeps overlapping carts from deadlocking.
	sort.Slice(items, func(i, j int) bool { return items[i].StockID < items[j].StockID })

	return service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			if len(items) == 0 {
				return service.store.ClearCart(ctx, buyer, seller)
			}

			for i, item := range items {
				if i > 0 && items[i-1].StockID == item.StockID {
					return apperr.Field("items", "Duplicate stock.")
				}

				valid, err := service.store.ValidCartStock(ctx, seller, item)
				if errors.Is(err, pgx.ErrNoRows) || (err == nil && !valid) {
					return apperr.NotFound("Stock is unavailable.")
				}

				if err != nil {
					return err
				}
			}

			return service.store.ReplaceCart(ctx, buyer, seller, items)
		},
	)
}

// ClearCart clears only the caller's selected seller cart.
func (service *Service) ClearCart(ctx context.Context, buyer, seller string) error {
	if err := cartParties(buyer, seller); err != nil {
		return err
	}

	return service.store.ClearCart(ctx, buyer, seller)
}
