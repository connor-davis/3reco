package market

import (
	"context"
	"errors"
	"math/big"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/notifications"
	"github.com/connor-davis/3reco/internal/services/transactions"
	store "github.com/connor-davis/3reco/internal/stores/market"
)

// cartHoldLifetime is how long a cart line keeps its stock reserved.
const cartHoldLifetime = 48 * time.Hour

// CartStores returns the caller's saved seller carts.
func (service *Service) CartStores(ctx context.Context, buyer string) ([]store.CartStore, error) {
	return service.store.CartStores(ctx, buyer)
}

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

			if err := RequireVerified(ctx, service.store, seller); err != nil {
				return err
			}

			for i, item := range items {
				line := transactions.SaleItem{
					MaterialID: item.MaterialID, Weight: item.Weight, Price: "0",
				}
				if err := transactions.CheckItems([]transactions.SaleItem{line}); err != nil {
					return err
				}

				if i > 0 && items[i-1].StockID == item.StockID {
					return apperr.Field("items", "Duplicate stock.")
				}
			}

			// Lock every stock row in id order before any hold is written, so
			// two buyers can never both reserve the last kilos.
			for _, item := range items {
				err := service.store.LockCartStock(ctx, seller, item)
				if errors.Is(err, pgx.ErrNoRows) {
					return apperr.NotFound("Stock is unavailable.")
				}

				if err != nil {
					return err
				}
			}

			cartID, err := service.store.ReplaceCart(ctx, buyer, seller, items)
			if err != nil {
				return err
			}

			keep := make([]string, 0, len(items))
			for _, item := range items {
				if err := service.holdLine(ctx, cartID, buyer, seller, item); err != nil {
					return err
				}

				keep = append(keep, item.StockID)
			}

			return service.store.ReleaseOtherHolds(ctx, cartID, keep)
		},
	)
}

// holdLine reserves one cart line, or refuses it with how much is left.
func (service *Service) holdLine(
	ctx context.Context,
	cartID, buyer, seller string,
	item store.CartItem,
) error {
	room, err := service.store.CartRoom(ctx, buyer, item.StockID)
	if err != nil {
		return err
	}

	wanted, _ := new(big.Rat).SetString(item.Weight)
	free, _ := new(big.Rat).SetString(room)
	if wanted.Cmp(free) > 0 {
		if free.Sign() == 0 {
			return apperr.Field("items", "None left.")
		}

		return apperr.Field("items", "Only "+room+" kg left.")
	}

	return service.store.HoldCartLine(ctx, cartID, buyer, seller, item, cartHoldLifetime)
}

// ClearCart clears only the caller's selected seller cart and frees its holds.
func (service *Service) ClearCart(ctx context.Context, buyer, seller string) error {
	if err := cartParties(buyer, seller); err != nil {
		return err
	}

	return service.db.InTx(ctx, func(ctx context.Context) error {
		return service.store.ClearCart(ctx, buyer, seller)
	})
}

// ExpireCartHolds removes cart lines whose 48-hour hold ended and tells each buyer,
// all in one transaction per batch so a line never goes without its notice.
func (service *Service) ExpireCartHolds(ctx context.Context) error {
	return service.db.InTx(ctx, func(ctx context.Context) error {
		expired, err := service.store.ExpireCartHolds(ctx)
		if err != nil {
			return err
		}

		for _, cart := range expired {
			body := "Your reservation for " + strings.Join(cart.Materials, ", ") + " at " +
				cart.SellerName + " ended, so it was removed from your cart."

			err := service.notes.Notify(
				ctx,
				cart.BuyerID,
				notifications.CartExpired,
				"Cart reservation ended",
				body,
				"/market/store/"+cart.SellerID,
			)
			if err != nil {
				return err
			}
		}

		return nil
	})
}
