// Package stock applies stock ownership and exact pricing rules.
package stock

import (
	"context"
	"errors"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/platform/storage"
	store "github.com/connor-davis/3reco/internal/stores/stock"
)

// MaxWeightKg is the maximum weight entered on a stock or collection line.
const MaxWeightKg = 1000000

// MaxPricePerKg is the maximum price entered per kg.
const MaxPricePerKg = 100000

// WeightLimitMessage explains the weight entry cap.
const WeightLimitMessage = "Weight must be 1 000 000 kg or less."

// PriceLimitMessage explains the price entry cap.
const PriceLimitMessage = "Price must be R 100 000.00 per kg or less."

// Service owns stock rules and transaction boundaries.
type Service struct {
	db      *database.DB
	store   *store.Store
	objects *storage.Client
}

// New builds the service.
func New(db *database.DB, rows *store.Store, objects *storage.Client) *Service {
	return &Service{db: db, store: rows, objects: objects}
}

// Input uses pointers so zero and omitted prices remain different.
type Input struct {
	MaterialID string  `json:"material_id"`
	Weight     *string `json:"weight"`
	Price      *string `json:"price"`
	IsListed   *bool   `json:"is_listed"`
}

// List reads only the caller's stock. listed is "", "listed" or "unlisted".
func (service *Service) List(
	ctx context.Context,
	owner string,
	query paging.Query,
	listed string,
) (any, error) {
	if listed != "" && listed != "listed" && listed != "unlisted" {
		return nil, apperr.BadRequest("Use listed or unlisted for status.", nil)
	}

	items, err := service.store.List(ctx, owner, query, listed)
	if err != nil {
		return nil, err
	}

	if query.All {
		return items, nil
	}

	return paging.Build(
		items,
		query.Limit,
		func(item store.Item) (time.Time, string) {
			return item.CreatedAt, item.ID
		},
	), nil
}

// Find allows the owner or the safe public projection of a listed row.
func (service *Service) Find(ctx context.Context, id, caller string) (store.Item, error) {
	item, err := service.store.Find(ctx, id, false)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && item.OwnerID != caller && !item.IsListed) {
		return item, apperr.NotFound("No such stock.")
	}

	return item, err
}

func validate(item store.Item, newWeight, newPrice bool) error {
	weight, err := Decimal(item.Weight, "weight", true)
	if err != nil {
		return err
	}
	if _, fraction, _ := strings.Cut(item.Weight, "."); newWeight && len(fraction) > 2 {
		return apperr.Field("weight", "Enter a weight with up to 2 decimals, such as 12.50.")
	}
	if newWeight && weight.Cmp(big.NewRat(MaxWeightKg, 1)) > 0 {
		return apperr.Field("weight", WeightLimitMessage)
	}

	price, err := Decimal(item.Price, "price", false)
	if err != nil {
		return err
	}

	if !new(big.Rat).Mul(price, big.NewRat(100, 1)).IsInt() {
		return apperr.Field("price", "Enter a price with up to 2 decimals, such as 12.50.")
	}
	if newPrice && price.Cmp(big.NewRat(MaxPricePerKg, 1)) > 0 {
		return apperr.Field("price", PriceLimitMessage)
	}

	base, err := Decimal(item.BasePrice, "base_price", false)
	if err != nil {
		return err
	}

	if price.Cmp(base) < 0 {
		return apperr.Field("price", "Price must be at least R "+base.FloatString(2)+" / kg.")
	}

	return nil
}

// Create starts stock unlisted unless is_listed is true, and validates the material price
// inside the transaction.
func (service *Service) Create(ctx context.Context, owner string, in Input) (string, error) {
	if in.Weight == nil || in.Price == nil || in.MaterialID == "" {
		return "", apperr.BadRequest("Provide material, weight and price.", nil)
	}

	item := store.Item{ID: database.NewID(), OwnerID: owner, MaterialID: in.MaterialID,
		Weight: *in.Weight, Price: *in.Price, IsListed: in.IsListed != nil && *in.IsListed}
	err := service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			base, err := service.store.BasePrice(ctx, item.MaterialID)
			if errors.Is(err, pgx.ErrNoRows) {
				return apperr.NotFound("No such material.")
			}

			if err != nil {
				return err
			}

			item.BasePrice = base
			if err := validate(item, true, true); err != nil {
				return err
			}

			return service.store.Create(ctx, item)
		},
	)

	return item.ID, err
}

// Update locks stock before checking ownership and applying only provided fields.
func (service *Service) Update(ctx context.Context, id, owner string, in Input) error {
	return service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			item, err := service.store.Find(ctx, id, true)
			if errors.Is(err, pgx.ErrNoRows) || (err == nil && item.OwnerID != owner) {
				return apperr.NotFound("No such stock.")
			}

			if err != nil {
				return err
			}

			weightChanged, priceChanged := false, false
			if in.Weight != nil {
				amount, err := Decimal(*in.Weight, "weight", false)
				if err != nil {
					return err
				}

				previous, _ := new(big.Rat).SetString(item.Weight)
				weightChanged = amount.Cmp(previous) != 0
				item.Weight = *in.Weight
			}

			if in.Price != nil {
				amount, err := Decimal(*in.Price, "price", false)
				if err != nil {
					return err
				}

				previous, _ := new(big.Rat).SetString(item.Price)
				priceChanged = amount.Cmp(previous) != 0
				item.Price = *in.Price
			}

			if in.IsListed != nil {
				item.IsListed = *in.IsListed
			}

			if in.Weight != nil {
				amount, err := Decimal(item.Weight, "weight", false)
				if err != nil {
					return err
				}

				held, err := service.store.Held(ctx, id)
				if err != nil {
					return err
				}

				reserved, _ := new(big.Rat).SetString(held)
				if amount.Cmp(reserved) < 0 {
					return apperr.Conflict("Some of this stock is held for open offers.")
				}
			}

			// Collections and trades can accumulate stock beyond the manual entry caps.
			if err := validate(item, weightChanged, priceChanged); err != nil {
				return err
			}

			return service.store.Update(ctx, item)
		},
	)
}

// Delete checks ownership under the same lock as the delete.
func (service *Service) Delete(ctx context.Context, id, owner string) error {
	return service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			item, err := service.store.Find(ctx, id, true)
			if errors.Is(err, pgx.ErrNoRows) || (err == nil && item.OwnerID != owner) {
				return apperr.NotFound("No such stock.")
			}

			if err != nil {
				return err
			}

			held, err := service.store.Held(ctx, id)
			if err != nil {
				return err
			}

			reserved, _ := new(big.Rat).SetString(held)
			if reserved.Sign() > 0 {
				return apperr.Conflict("Some of this stock is held for open offers.")
			}

			if err := service.store.Delete(ctx, id, owner); err != nil {
				return err
			}

			if item.ImageKey != "" {
				service.objects.RemoveAfterCommit(ctx, item.ImageKey)
			}

			return nil
		},
	)
}

var decimalPattern = regexp.MustCompile(`^[0-9]+(\.[0-9]+)?$`)

// Decimal validates finite plain decimal strings without rounding through a float.
func Decimal(value, field string, positive bool) (*big.Rat, error) {
	if len(value) > 100 || !decimalPattern.MatchString(value) {
		return nil, apperr.Field(field, "Enter a decimal string.")
	}

	number, ok := new(big.Rat).SetString(value)
	if !ok || (positive && number.Sign() <= 0) {
		return nil, apperr.Field(field, "Enter a positive amount.")
	}

	return number, nil
}
