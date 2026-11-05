// Package collectors applies management scope and payout redaction.
package collectors

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	profile "github.com/connor-davis/3reco/internal/services/profile"
	store "github.com/connor-davis/3reco/internal/stores/collectors"
)

// Service owns collector rules and transactions.
type Service struct {
	db    *database.DB
	store *store.Store
}

// New builds the service.
func New(db *database.DB, rows *store.Store) *Service { return &Service{db: db, store: rows} }

// Input preserves omitted collector fields on PATCH.
type Input struct {
	Name                  *string `json:"name"`
	Email                 *string `json:"email"`
	Phone                 *string `json:"phone"`
	Image                 *string `json:"image"`
	BankAccountHolderName *string `json:"bank_account_holder_name"`
	BankName              *string `json:"bank_name"`
	BankAccountNumber     *string `json:"bank_account_number"`
	BankBranchCode        *string `json:"bank_branch_code"`
	BankAccountType       *string `json:"bank_account_type"`
	PayoutMethod          *string `json:"payout_method"`
	EwalletPlatformName   *string `json:"ewallet_platform_name"`
	EwalletPaymentID      *string `json:"ewallet_payment_id"`
	StreetAddress         *string `json:"street_address"`
	City                  *string `json:"city"`
	Province              *string `json:"province"`
	AreaCode              *int    `json:"area_code"`
}

func manages(user auth.User, item store.Collector) bool {
	return auth.HasRole(user, "admin", "staff") ||
		(auth.HasRole(user, "business") && item.CreatedByBusinessID != nil && *item.CreatedByBusinessID == user.ID)
}

func redact(user auth.User, item store.Collector) store.Collector {
	if manages(user, item) {
		return item
	}

	item.Email = ""
	item.Phone = ""

	item.BankAccountHolderName = ""
	item.BankName = ""
	item.BankAccountNumber = ""
	item.BankBranchCode = ""
	item.BankAccountType = ""

	item.PayoutMethod = ""
	item.EwalletPlatformName = ""
	item.EwalletPaymentID = ""

	item.StreetAddress = ""
	item.AreaCode = nil

	return item
}

// Find returns a redacted collector unless the caller has management scope.
func (service *Service) Find(ctx context.Context, user auth.User, id string) (store.Collector, error) {
	if user.ID == "" {
		return store.Collector{}, apperr.Unauthorized("Please sign in.")
	}

	item, err := service.store.Find(ctx, id, false)
	if errors.Is(err, pgx.ErrNoRows) {
		return item, apperr.NotFound("No such collector.")
	}

	return redact(user, item), err
}

// List keeps the legacy directory while gating private fields on every row.
func (service *Service) List(ctx context.Context, user auth.User, query paging.Query, selection bool) (any, error) {
	if !auth.HasRole(user, "admin", "staff", "business") {
		return nil, apperr.Forbidden("You cannot manage collectors.")
	}

	items, err := service.store.List(ctx, query)
	if err != nil {
		return nil, err
	}

	for i := range items {
		items[i] = redact(user, items[i])
	}

	if selection {
		if len(items) > 200 {
			items = items[:200]
		}

		return items, nil
	}

	return paging.Build(
		items,
		query.Limit,
		func(item store.Collector) (time.Time, string) {
			return item.CreatedAt, item.ID
		},
	), nil
}

// Save scopes changes to the creator business or staff and validates the merged record.
func (service *Service) Save(ctx context.Context, user auth.User, id string, in Input) (string, error) {
	if !auth.HasRole(user, "admin", "staff", "business") {
		return "", apperr.Forbidden("You cannot manage collectors.")
	}

	creating := id == ""
	if creating {
		id = database.NewID()
	}

	err := service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			item := store.Collector{ID: id, CreatedByUserID: user.ID}
			if creating && auth.HasRole(user, "business") {
				item.CreatedByBusinessID = &user.ID
			}

			if !creating {
				var err error
				item, err = service.store.Find(ctx, id, true)
				if errors.Is(err, pgx.ErrNoRows) || (err == nil && !manages(user, item)) {
					return apperr.NotFound("No such collector.")
				}

				if err != nil {
					return err
				}
			}

			if in.Name != nil {
				item.Name = strings.TrimSpace(*in.Name)
			}

			if in.Email != nil {
				item.Email = strings.TrimSpace(*in.Email)
			}

			if in.Phone != nil {
				item.Phone = strings.TrimSpace(*in.Phone)
			}

			if in.Image != nil {
				item.Image = strings.TrimSpace(*in.Image)
			}

			if in.BankAccountHolderName != nil {
				item.BankAccountHolderName = strings.TrimSpace(*in.BankAccountHolderName)
			}

			if in.BankName != nil {
				item.BankName = strings.TrimSpace(*in.BankName)
			}

			if in.BankAccountNumber != nil {
				item.BankAccountNumber = strings.TrimSpace(*in.BankAccountNumber)
			}

			if in.BankBranchCode != nil {
				item.BankBranchCode = strings.TrimSpace(*in.BankBranchCode)
			}

			if in.BankAccountType != nil {
				item.BankAccountType = strings.TrimSpace(*in.BankAccountType)
			}

			if in.PayoutMethod != nil {
				item.PayoutMethod = strings.TrimSpace(*in.PayoutMethod)
			}

			if in.EwalletPlatformName != nil {
				item.EwalletPlatformName = strings.TrimSpace(*in.EwalletPlatformName)
			}

			if in.EwalletPaymentID != nil {
				item.EwalletPaymentID = strings.TrimSpace(*in.EwalletPaymentID)
			}

			if in.StreetAddress != nil {
				item.StreetAddress = strings.TrimSpace(*in.StreetAddress)
			}

			if in.City != nil {
				item.City = strings.TrimSpace(*in.City)
			}

			if in.Province != nil {
				item.Province = strings.TrimSpace(*in.Province)
			}

			if in.AreaCode != nil {
				item.AreaCode = in.AreaCode
			}

			if err := validate(item); err != nil {
				return err
			}

			phone, err := profile.Phone(item.Phone)
			if err != nil {
				return err
			}

			item.Phone = phone
			conflict, err := service.store.PhoneConflict(ctx, phone)
			if err != nil {
				return err
			}

			if conflict {
				return apperr.Conflict("That phone number belongs to a business.")
			}

			if creating {
				return service.store.Create(ctx, item)
			}

			return service.store.Save(ctx, item)
		},
	)
	if _, duplicate := database.IsUnique(err); duplicate {
		err = apperr.Conflict("A collector with that phone number already exists.")
	}

	return id, err
}

// Delete requires a confirmation value and staff authority.
func (service *Service) Delete(ctx context.Context, user auth.User, id, confirmation string) error {
	if !auth.HasRole(user, "admin", "staff") {
		return apperr.Forbidden("Only staff may remove collectors.")
	}

	return service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			item, err := service.store.Find(ctx, id, true)
			if errors.Is(err, pgx.ErrNoRows) {
				return apperr.NotFound("No such collector.")
			}

			if err != nil {
				return err
			}

			expected := item.Email
			confirmation = strings.TrimSpace(confirmation)
			if expected != "" {
				if !strings.EqualFold(expected, confirmation) {
					return apperr.Field("confirmation_value", "Enter the collector email.")
				}
			} else {
				normalized, err := profile.Phone(confirmation)
				if err != nil || normalized != item.Phone {
					return apperr.Field("confirmation_value", "Enter the collector phone.")
				}
			}

			return service.store.Delete(ctx, id)
		},
	)
}
