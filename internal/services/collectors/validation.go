package collectors

import (
	"net/mail"
	"regexp"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	profile "github.com/connor-davis/3reco/internal/services/profile"
	store "github.com/connor-davis/3reco/internal/stores/collectors"
)

// branchCode is the universal South African branch code: six digits.
var branchCode = regexp.MustCompile(`^[0-9]{6}$`)

func validate(item *store.Collector) error {
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

	fields := map[string]string{}
	bankFields := map[string]string{
		"bank_account_holder_name": item.BankAccountHolderName,
		"bank_name":                item.BankName,
		"bank_account_number":      item.BankAccountNumber,
		"bank_branch_code":         item.BankBranchCode,
		"bank_account_type":        item.BankAccountType,
	}
	walletFields := map[string]string{
		"ewallet_platform_name": item.EwalletPlatformName,
		"ewallet_payment_id":    item.EwalletPaymentID,
	}
	hasDetails := false

	for key, value := range bankFields {
		hasDetails = hasDetails || value != ""
		if item.PayoutMethod == "bank" && value == "" {
			fields[key] = "Complete all bank details."
		}
	}

	for key, value := range walletFields {
		hasDetails = hasDetails || value != ""
		if item.PayoutMethod == "ewallet" && value == "" {
			fields[key] = "Complete all ewallet details."
		}
	}

	if len(fields) > 0 {
		return apperr.BadRequest("Please fix the highlighted fields.", fields)
	}

	switch item.PayoutMethod {
	case "":
		if hasDetails {
			return apperr.Field("payout_method", "Choose a payout method.")
		}
	case "bank":
		if item.EwalletPlatformName != "" || item.EwalletPaymentID != "" {
			return apperr.Field("payout_method", "Provide bank details only.")
		}

		if _, err := profile.Bank(
			item.BankAccountHolderName,
			item.BankName,
			item.BankAccountNumber,
			item.BankBranchCode,
			item.BankAccountType,
		); err != nil {
			return err
		}

		if !branchCode.MatchString(item.BankBranchCode) {
			return apperr.Field("bank_branch_code", "Enter a 6-digit branch code.")
		}
	case "ewallet":
		for _, value := range bankFields {
			if value != "" {
				return apperr.Field("payout_method", "Provide ewallet details only.")
			}
		}
	default:
		return apperr.Field("payout_method", "Choose bank or ewallet.")
	}

	return profile.Address(item.Province, item.AreaCode)
}
