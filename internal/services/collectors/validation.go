package collectors

import (
	"net/mail"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	profile "github.com/connor-davis/3reco/internal/services/profile"
	store "github.com/connor-davis/3reco/internal/stores/collectors"
)

func validate(item store.Collector) error {
	if item.Name == "" {
		return apperr.Field("name", "Enter the collector name.")
	}

	if item.Email == "" && item.Phone == "" {
		return apperr.BadRequest("Please fix the highlighted fields.", map[string]string{
			"email": "Add an email or a phone number.",
			"phone": "Add an email or a phone number.",
		})
	}

	if item.Email != "" {
		address, err := mail.ParseAddress(item.Email)
		if err != nil || address.Address != item.Email {
			return apperr.Field("email", "Enter a valid email address.")
		}
	}

	bank, err := profile.Bank(
		item.BankAccountHolderName,
		item.BankName,
		item.BankAccountNumber,
		item.BankBranchCode,
		item.BankAccountType,
	)
	if err != nil {
		return err
	}

	ewallet := item.EwalletPlatformName != "" || item.EwalletPaymentID != ""
	switch item.PayoutMethod {
	case "":
		if bank || ewallet {
			return apperr.Field("payout_method", "Choose a payout method.")
		}
	case "bank":
		if !bank || ewallet {
			return apperr.BadRequest("Provide complete bank details only.", nil)
		}
	case "ewallet":
		if bank || item.EwalletPlatformName == "" || item.EwalletPaymentID == "" {
			return apperr.BadRequest("Provide complete ewallet details only.", nil)
		}
	default:
		return apperr.Field("payout_method", "Choose bank or ewallet.")
	}

	return profile.Address(item.Province, item.AreaCode)
}
