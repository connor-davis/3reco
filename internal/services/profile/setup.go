package profile

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/stores/businesses"
	store "github.com/connor-davis/3reco/internal/stores/profile"
)

// Setup finishes a new account's profile. A guest picks collector or
// business, once, and cannot pick anything else. Someone who already has a
// role (an older incomplete profile) sends no role and keeps theirs. Either
// way the saved profile must hold every field that role needs.
func (service *Service) Setup(ctx context.Context, id, role string, business ...string) error {
	if role != "" && role != "collector" && role != "business" {
		return apperr.BadRequest("Choose collector or business.", nil)
	}

	return service.db.InTx(ctx, func(ctx context.Context) error {
		item, err := service.store.Find(ctx, id, true)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("No such profile.")
		}

		if err != nil {
			return err
		}

		switch {
		case item.Role == "guest" && role == "":
			return apperr.BadRequest("Choose collector or business.", nil)
		case item.Role != "guest" && role != "":
			return apperr.Conflict("Your account type is already set.")
		case item.Role == "admin" || item.Role == "staff":
			return apperr.Conflict("Staff accounts do not need setup.")
		}

		// A guest gets the role they chose; everyone else keeps theirs.
		final := role
		if final == "" {
			final = item.Role
		}

		if err := missingFields(item, final); err != nil {
			return err
		}

		if final == "business" {
			if err := service.missingBusiness(ctx, business...); err != nil {
				return err
			}
		}

		return service.store.Finish(ctx, id, role)
	})
}

// missingFields names the first personal thing a collector or business person
// still has to fill in. A collector also needs the address and bank on their
// own profile; a business keeps those on the business. The web form checks the
// same list, so this is the safety net.
func missingFields(item store.Profile, role string) error {
	required := []struct{ field, value, message string }{
		{"first_name", item.FirstName, "Enter your first name."},
		{"last_name", item.LastName, "Enter your last name."},
		{"phone", item.Phone, "Enter your phone number."},
	}

	if role == "collector" {
		required = append(required, addressAndBank(
			item.StreetAddress, item.City, item.Province, item.BankAccountHolderName, item.BankName,
			item.BankAccountNumber, item.BankBranchCode, item.BankAccountType)...)
	}

	if err := firstEmpty(required); err != nil {
		return err
	}

	if role == "collector" && item.AreaCode == nil {
		return apperr.Field("area_code", "Enter your area code.")
	}

	return nil
}

// missingBusiness checks the business row of the person finishing setup as a
// business. Someone who joined a team they do not own has nothing to fill in:
// the Owner set the business up.
func (service *Service) missingBusiness(ctx context.Context, business ...string) error {
	if len(business) < 2 || business[0] == "" {
		return apperr.Field("business_name", "Enter your business name.")
	}

	if business[1] != "owner" {
		return nil
	}

	item, err := businesses.New(service.db).FindProfile(ctx, business[0], false)
	if err != nil {
		return err
	}

	required := append([]struct{ field, value, message string }{
		{"business_name", item.BusinessName, "Enter your business name."},
		{"business_registration_number", item.BusinessRegistrationNumber,
			"Enter your business registration number."},
	}, addressAndBank(item.StreetAddress, item.City, item.Province, item.BankAccountHolderName,
		item.BankName, item.BankAccountNumber, item.BankBranchCode, item.BankAccountType)...)

	if err := firstEmpty(required); err != nil {
		return err
	}

	if item.AreaCode == nil {
		return apperr.Field("area_code", "Enter your area code.")
	}

	return nil
}

func addressAndBank(street, city, province, holder, bank, account, branch, kind string) []struct{ field, value, message string } {
	return []struct{ field, value, message string }{
		{"street_address", street, "Enter your street address."},
		{"city", city, "Enter your city."},
		{"province", province, "Choose your province."},
		{"bank_account_holder_name", holder, "Enter the account holder name."},
		{"bank_name", bank, "Enter your bank."},
		{"bank_account_number", account, "Enter your account number."},
		{"bank_branch_code", branch, "Enter your branch code."},
		{"bank_account_type", kind, "Choose an account type."},
	}
}

func firstEmpty(required []struct{ field, value, message string }) error {
	for _, want := range required {
		if strings.TrimSpace(want.value) == "" {
			return apperr.Field(want.field, want.message)
		}
	}

	return nil
}
