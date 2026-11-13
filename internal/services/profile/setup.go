package profile

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
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
		item, err := service.store.Find(ctx, id, true, business...)
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

		return service.store.Finish(ctx, id, role)
	})
}

// missingFields names the first thing a collector or business still has to
// fill in. The web form checks the same list, so this is the safety net.
func missingFields(item store.Profile, role string) error {
	required := []struct{ field, value, message string }{
		{"first_name", item.FirstName, "Enter your first name."},
		{"last_name", item.LastName, "Enter your last name."},
		{"phone", item.Phone, "Enter your phone number."},
		{"street_address", item.StreetAddress, "Enter your street address."},
		{"city", item.City, "Enter your city."},
		{"province", item.Province, "Choose your province."},
		{"bank_account_holder_name", item.BankAccountHolderName, "Enter the account holder name."},
		{"bank_name", item.BankName, "Enter your bank."},
		{"bank_account_number", item.BankAccountNumber, "Enter your account number."},
		{"bank_branch_code", item.BankBranchCode, "Enter your branch code."},
		{"bank_account_type", item.BankAccountType, "Choose an account type."},
	}

	if role == "business" {
		required = append(required,
			struct{ field, value, message string }{
				"business_name", item.BusinessName, "Enter your business name.",
			},
			struct{ field, value, message string }{
				"business_registration_number", item.BusinessRegistrationNumber,
				"Enter your business registration number.",
			},
		)
	}

	for _, want := range required {
		if strings.TrimSpace(want.value) == "" {
			return apperr.Field(want.field, want.message)
		}
	}

	if item.AreaCode == nil {
		return apperr.Field("area_code", "Enter your area code.")
	}

	return nil
}
