// Package stock applies stock ownership and exact pricing rules.
package stock

import (
	"context"
	"errors"
	"math/big"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	store "github.com/connor-davis/3reco/internal/stores/stock"
)

// Service owns stock rules and transaction boundaries.
type Service struct {
	db    *database.DB
	store *store.Store
}

// New builds the service.
func New(db *database.DB, rows *store.Store) *Service { return &Service{db: db, store: rows} }

// Input uses pointers so zero and omitted prices remain different.
type Input struct {
	MaterialID string  `json:"material_id"`
	Weight     *string `json:"weight"`
	Price      *string `json:"price"`
	IsListed   *bool   `json:"is_listed"`
}

// List reads only the caller's stock.
func (service *Service) List(ctx context.Context, owner string, query paging.Query) (any, error) {
	items, err := service.store.List(ctx, owner, query)
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

func validate(item store.Item) error {
	if _, err := Decimal(item.Weight, "weight", true); err != nil {
		return err
	}

	price, err := Decimal(item.Price, "price", false)
	if err != nil {
		return err
	}

	base, err := Decimal(item.BasePrice, "base_price", false)
	if err != nil {
		return err
	}

	if price.Cmp(base) < 0 {
		return apperr.Field("price", "Price must meet the material base price.")
	}

	return nil
}

// Create starts stock unlisted and validates the material price inside the transaction.
func (service *Service) Create(ctx context.Context, owner string, in Input) (string, error) {
	if in.Weight == nil || in.Price == nil || in.MaterialID == "" {
		return "", apperr.BadRequest("Provide material, weight and price.", nil)
	}

	item := store.Item{ID: database.NewID(), OwnerID: owner, MaterialID: in.MaterialID,
		Weight: *in.Weight, Price: *in.Price}
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
			if err := validate(item); err != nil {
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

			oldListed := item.IsListed
			if in.Weight != nil {
				item.Weight = *in.Weight
			}

			if in.Price != nil {
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

			if err := validate(item); err != nil {
				return err
			}

			if err := service.store.Update(ctx, item); err != nil {
				return err
			}

			if oldListed != item.IsListed {
				return service.notifyListing(ctx, item)
			}

			return nil
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

			return service.store.Delete(ctx, id, owner)
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
