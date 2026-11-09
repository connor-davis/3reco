// Package materials enforces administrator-only catalog changes.
package materials

import (
	"context"
	"errors"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/stock"
	store "github.com/connor-davis/3reco/internal/stores/materials"
)

// Service applies catalog rules.
type Service struct {
	db    *database.DB
	store *store.Store
}

// New builds the service.
func New(db *database.DB, rows *store.Store) *Service { return &Service{db: db, store: rows} }

// Input preserves omitted catalog fields on PATCH.
type Input struct {
	Name         *string `json:"name"`
	CarbonFactor *string `json:"carbon_factor"`
	GWCode       *string `json:"gw_code"`
	Price        *string `json:"price"`
}

// Find reads a safe public catalog entry.
func (service *Service) Find(ctx context.Context, id string) (store.Material, error) {
	item, err := service.store.Find(ctx, id, false)
	if errors.Is(err, pgx.ErrNoRows) {
		return item, apperr.NotFound("No such material.")
	}

	return item, err
}

// List reads the safe public catalog.
func (service *Service) List(ctx context.Context, query paging.Query) (any, error) {
	items, err := service.store.List(ctx, query)
	if err != nil {
		return nil, err
	}

	if query.All {
		return items, nil
	}

	return paging.Build(
		items,
		query.Limit,
		func(item store.Material) (time.Time, string) {
			return item.CreatedAt, item.ID
		},
	), nil
}

// Save validates administrator authority again at the service boundary.
func (service *Service) Save(ctx context.Context, user auth.User, id string, in Input) (string, error) {
	if !auth.HasRole(user, "admin") {
		return "", apperr.Forbidden("Only admins may change materials.")
	}

	creating := id == ""
	if creating {
		id = database.NewID()
	}

	err := service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			if err := service.store.LockCatalog(ctx); err != nil {
				return err
			}

			item := store.Material{ID: id}
			if !creating {
				var err error
				item, err = service.store.Find(ctx, id, true)
				if errors.Is(err, pgx.ErrNoRows) {
					return apperr.NotFound("No such material.")
				}

				if err != nil {
					return err
				}
			}

			if in.Name != nil {
				item.Name = strings.TrimSpace(*in.Name)
			}

			if in.GWCode != nil {
				item.GWCode = strings.TrimSpace(*in.GWCode)
			}

			if in.CarbonFactor != nil {
				item.CarbonFactor = *in.CarbonFactor
			}

			if in.Price != nil {
				item.Price = *in.Price
			}

			if item.Name == "" {
				return apperr.Field("name", "Enter the material name.")
			}
			if item.GWCode == "" {
				return apperr.Field("gw_code", "Enter the GW code, for example GW13.")
			}

			if err := checkAmount(item.Price, "price", true); err != nil {
				return err
			}
			if err := checkAmount(item.CarbonFactor, "carbon_factor", false); err != nil {
				return err
			}

			name, code, err := service.store.Conflicts(ctx, item)
			if err != nil {
				return err
			}
			for field, duplicate := range map[string]bool{"name": name, "gw_code": code} {
				if duplicate {
					message := "A material with this name already exists."
					if field == "gw_code" {
						message = "A material with this GW code already exists."
					}
					failure := apperr.Conflict(message)
					failure.Data = map[string]string{field: message}
					return failure
				}
			}

			if creating {
				return service.store.Create(ctx, item)
			}

			return service.store.Update(ctx, item)
		},
	)

	return id, err
}

var amountPattern = regexp.MustCompile(`^[0-9]{1,12}(\.[0-9]{1,2})?$`)

func checkAmount(raw, field string, capped bool) error {
	if !amountPattern.MatchString(raw) {
		return apperr.Field(field, "Enter a positive amount with up to 2 decimals.")
	}
	number, err := stock.Decimal(raw, field, false)
	if err != nil {
		return err
	}
	if number.Sign() <= 0 {
		return apperr.Field(field, "Enter a positive amount with up to 2 decimals.")
	}
	if capped && number.Cmp(big.NewRat(100000, 1)) > 0 {
		return apperr.Field(field, "Price must be R 100 000.00 per kg or less.")
	}

	return nil
}

// Delete reports references as a conflict instead of leaking database errors.
func (service *Service) Delete(ctx context.Context, user auth.User, id string) error {
	if !auth.HasRole(user, "admin") {
		return apperr.Forbidden("Only admins may change materials.")
	}

	return service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			if err := service.store.LockCatalog(ctx); err != nil {
				return err
			}

			_, err := service.store.Find(ctx, id, true)
			if errors.Is(err, pgx.ErrNoRows) {
				return apperr.NotFound("No such material.")
			}

			if err != nil {
				return err
			}

			err = service.store.Delete(ctx, id)
			var failure *pgconn.PgError
			if errors.As(err, &failure) && failure.Code == "23503" {
				return apperr.Conflict(
					"This material is used in past trades or stock, so it can't be deleted.",
				)
			}

			return err
		},
	)
}
