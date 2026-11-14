// Package profile applies caller-only edits and safe directory projections.
package profile

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/platform/storage"
	store "github.com/connor-davis/3reco/internal/stores/profile"
)

// Service owns profile validation and edits.
type Service struct {
	db      *database.DB
	store   *store.Store
	objects *storage.Client
}

// New builds the service.
func New(db *database.DB, rows *store.Store, objects *storage.Client) *Service {
	return &Service{db: db, store: rows, objects: objects}
}

// Input lists editable fields only. Email changes belong to verified auth flows.
type Input struct {
	Name                       *string `json:"name"`
	Image                      *string `json:"image"`
	Phone                      *string `json:"phone"`
	FirstName                  *string `json:"first_name"`
	LastName                   *string `json:"last_name"`
	IDNumber                   *string `json:"id_number"`
	BusinessName               *string `json:"business_name"` // refused: see Update
	BusinessRegistrationNumber *string `json:"business_registration_number"`
	BankAccountHolderName      *string `json:"bank_account_holder_name"`
	BankName                   *string `json:"bank_name"`
	BankAccountNumber          *string `json:"bank_account_number"`
	BankBranchCode             *string `json:"bank_branch_code"`
	BankAccountType            *string `json:"bank_account_type"`
	StreetAddress              *string `json:"street_address"`
	City                       *string `json:"city"`
	Province                   *string `json:"province"`
	AreaCode                   *int    `json:"area_code"`
	ProfileComplete            *bool   `json:"profile_complete"`
	AgreedToTerms              *bool   `json:"agreed_to_terms"`
}

// Find reads only the profile selected by the session. Postgres masks the ID
// and bank account numbers ("•••• 1234"), so no whole number reaches Go.
func (service *Service) Find(ctx context.Context, id string) (store.Profile, error) {
	item, err := service.store.Find(ctx, id, false)
	if errors.Is(err, pgx.ErrNoRows) {
		return item, apperr.NotFound("No such profile.")
	}

	return item, err
}

// Public returns an allowlisted projection independent of who asks.
func (service *Service) Public(ctx context.Context, id string) (store.PublicUser, error) {
	item, err := service.store.Public(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return item, apperr.NotFound("No such user.")
	}

	return item, err
}

// Directory is the authenticated collector-account directory.
func (service *Service) Directory(ctx context.Context, query paging.Query) (paging.Page[store.PublicUser], error) {
	items, err := service.store.Directory(ctx, query)
	if err != nil {
		return paging.Page[store.PublicUser]{}, err
	}

	return paging.Build(
		items,
		query.Limit,
		func(item store.PublicUser) (time.Time, string) {
			return item.CreatedAt, item.ID
		},
	), nil
}

// Update preserves omitted values and never accepts a target user ID.
func (service *Service) Update(ctx context.Context, id string, in Input, business ...string) error {
	return service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			item, err := service.store.Find(ctx, id, true)
			if errors.Is(err, pgx.ErrNoRows) {
				return apperr.NotFound("No such profile.")
			}

			if err != nil {
				return err
			}

			// A business's details are not part of the person: they have their own
			// page, and only its Owner may change them.
			businessFields := in.BankAccountHolderName != nil || in.BankName != nil ||
				in.BankAccountNumber != nil || in.BankBranchCode != nil ||
				in.BankAccountType != nil || in.StreetAddress != nil ||
				in.City != nil || in.Province != nil || in.AreaCode != nil
			if in.BusinessName != nil || in.BusinessRegistrationNumber != nil || (businessFields &&
				(item.Role == "business" || (len(business) > 0 && business[0] != ""))) {
				return apperr.BadRequest("Change business details on the Business page.", nil)
			}

			if in.Name != nil {
				item.Name = strings.TrimSpace(*in.Name)
			}

			if in.Image != nil {
				item.Image = strings.TrimSpace(*in.Image)
			}

			if in.Phone != nil {
				item.Phone = strings.TrimSpace(*in.Phone)
			}

			if in.FirstName != nil {
				item.FirstName = strings.TrimSpace(*in.FirstName)
			}

			if in.LastName != nil {
				item.LastName = strings.TrimSpace(*in.LastName)
			}

			if in.IDNumber != nil && !IsMask(*in.IDNumber, item.IDNumber) {
				item.IDNumber = strings.TrimSpace(*in.IDNumber)
				item.ReplaceIDNumber = true
			}

			if in.BankAccountHolderName != nil {
				item.BankAccountHolderName = strings.TrimSpace(*in.BankAccountHolderName)
			}

			if in.BankName != nil {
				item.BankName = strings.TrimSpace(*in.BankName)
			}

			if in.BankAccountNumber != nil && !IsMask(*in.BankAccountNumber, item.BankAccountNumber) {
				item.BankAccountNumber = strings.TrimSpace(*in.BankAccountNumber)
				item.ReplaceBankAccount = true
			}

			if in.BankBranchCode != nil {
				item.BankBranchCode = strings.TrimSpace(*in.BankBranchCode)
			}

			if in.BankAccountType != nil {
				item.BankAccountType = strings.TrimSpace(*in.BankAccountType)
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

			if in.ProfileComplete != nil {
				item.ProfileComplete = *in.ProfileComplete
			}

			if in.AgreedToTerms != nil {
				item.AgreedToTerms = *in.AgreedToTerms
			}

			if item.Role == "guest" && in.ProfileComplete != nil && *in.ProfileComplete {
				return apperr.BadRequest("Finish your setup to complete your profile.", nil)
			}

			if item.Name == "" {
				return apperr.Field("name", "Enter your name.")
			}

			if in.Phone != nil {
				item.Phone, err = Phone(item.Phone)
				if err != nil {
					return err
				}
			}

			_, err = Bank(
				item.BankAccountHolderName,
				item.BankName,
				item.BankAccountNumber,
				item.BankBranchCode,
				item.BankAccountType,
			)
			if err != nil {
				return err
			}

			if err := Address(item.Province, item.AreaCode); err != nil {
				return err
			}

			return service.store.Save(ctx, item)
		},
	)
}

// IsMask tells an unchanged form field: the caller sent back the masked value
// they were given, so the stored number stays.
func IsMask(sent, masked string) bool {
	return masked != "" && strings.TrimSpace(sent) == masked
}
