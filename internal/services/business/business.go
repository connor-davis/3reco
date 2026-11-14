// Package business owns the Business page rules: who may read and change a
// business's name, bank and location, who may open one, and its data export.
package business

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/profile"
	"github.com/connor-davis/3reco/internal/stores/businesses"
	"github.com/connor-davis/3reco/internal/stores/collectors"
	privacy "github.com/connor-davis/3reco/internal/stores/privacy"
)

// Service owns business profile reads, writes and export.
type Service struct {
	db      *database.DB
	store   *businesses.Store
	privacy *privacy.Store
	cipher  *crypt.Cipher
}

// New builds the service.
func New(db *database.DB, rows *businesses.Store, events *privacy.Store, cipher *crypt.Cipher) *Service {
	return &Service{db: db, store: rows, privacy: events, cipher: cipher}
}

// Input lists the editable business fields. The business id is never accepted:
// it always comes from the session.
type Input struct {
	BusinessName               *string `json:"business_name"`
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
}

// canOpen is true for someone who may start a business during setup: a guest
// or a business account with no business yet. Collectors, staff and admin never
// open one, and nobody who already belongs to a business does.
func canOpen(user auth.User) bool {
	if user.ActiveBusinessID != "" {
		return false
	}

	role := ""
	if user.Role != nil {
		role = *user.Role
	}

	return role == "" || role == auth.RoleGuest || role == auth.RoleBusiness
}

// Find reads the active business for an Owner or Manager. Someone who may open
// a business gets an empty one to fill in; everyone else is refused.
func (s *Service) Find(ctx context.Context, user auth.User) (businesses.Profile, error) {
	if canOpen(user) {
		return businesses.Profile{CanEdit: true}, nil
	}

	if err := auth.RequireBusiness(user, "manager"); err != nil {
		return businesses.Profile{}, err
	}

	item, err := s.store.FindProfile(ctx, user.ActiveBusinessID, false)
	if errors.Is(err, pgx.ErrNoRows) {
		return item, apperr.NotFound("No such business.")
	}

	item.CanEdit = user.BusinessRole == "owner"

	return item, err
}

// Update changes the active business. Only its Owner may. A person with no
// business yet who may open one creates it here and becomes its Owner.
func (s *Service) Update(ctx context.Context, user auth.User, in Input) error {
	return s.db.InTx(ctx, func(ctx context.Context) error {
		id := user.ActiveBusinessID

		if canOpen(user) {
			has, err := s.store.HasBusiness(ctx, user.ID)
			if err != nil {
				return err
			}

			if has {
				return apperr.Conflict("You already have a business.")
			}

			if err := s.store.Open(ctx, user.ID); err != nil {
				return err
			}

			id = user.ID
		} else if err := auth.RequireBusiness(user, "owner"); err != nil {
			return err
		}

		item, err := s.store.FindProfile(ctx, id, true)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("No such business.")
		}

		if err != nil {
			return err
		}

		if err := apply(&item, in); err != nil {
			return err
		}

		sealed, err := s.cipher.Encrypt(item.BankAccountNumber)
		if err != nil {
			return err
		}

		return s.store.SaveProfile(ctx, item, sealed, collectors.Last4(item.BankAccountNumber))
	})
}

// apply merges the sent fields over the stored ones and validates the result.
// A masked account number sent back unchanged keeps the stored one.
func apply(item *businesses.Profile, in Input) error {
	set := func(target *string, sent *string) {
		if sent != nil {
			*target = strings.TrimSpace(*sent)
		}
	}

	set(&item.BusinessName, in.BusinessName)
	set(&item.BusinessRegistrationNumber, in.BusinessRegistrationNumber)
	set(&item.BankAccountHolderName, in.BankAccountHolderName)
	set(&item.BankName, in.BankName)
	set(&item.BankBranchCode, in.BankBranchCode)
	set(&item.BankAccountType, in.BankAccountType)
	set(&item.StreetAddress, in.StreetAddress)
	set(&item.City, in.City)
	set(&item.Province, in.Province)

	if in.AreaCode != nil {
		item.AreaCode = in.AreaCode
	}

	if in.BankAccountNumber != nil && !profile.IsMask(*in.BankAccountNumber, item.BankAccountNumber) {
		item.BankAccountNumber = strings.TrimSpace(*in.BankAccountNumber)
		item.ReplaceBankAccount = true
	}

	if in.BusinessName != nil && item.BusinessName == "" {
		return apperr.Field("business_name", "Enter the business name.")
	}

	_, err := profile.Bank(item.BankAccountHolderName, item.BankName, item.BankAccountNumber,
		item.BankBranchCode, item.BankAccountType)
	if err != nil {
		return err
	}

	return profile.Address(item.Province, item.AreaCode)
}

// Export is the Owner's download of the active business's data. The business
// row carries its bank account whole: it is the Owner's own. The download is
// recorded as a privacy event.
func (s *Service) Export(ctx context.Context, user auth.User) (map[string]any, error) {
	if err := auth.RequireBusiness(user, "owner"); err != nil {
		return nil, err
	}

	data, sealed, err := s.store.Export(ctx, user.ActiveBusinessID)
	if err != nil {
		return nil, err
	}

	row, err := s.store.FindProfile(ctx, user.ActiveBusinessID, false)
	if err != nil {
		return nil, err
	}

	if row.BankAccountNumber, err = s.cipher.Decrypt(sealed); err != nil {
		return nil, err
	}

	out := make(map[string]any, len(data)+2)
	for name, rows := range data {
		out[name] = json.RawMessage(rows)
	}

	out["business"] = row
	out["exported_at"] = time.Now().UTC()

	err = s.privacy.RecordExport(ctx, user.ID, user.ActiveBusinessID, "business", map[string]string{})

	return out, err
}
