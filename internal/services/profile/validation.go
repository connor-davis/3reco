package profile

import (
	"slices"
	"strings"

	"github.com/connor-davis/3reco/internal/platform/apperr"
)

// Phone canonicalizes accepted South African phone formats.
func Phone(value string) (string, error) {
	var digits strings.Builder
	for _, char := range strings.TrimSpace(value) {
		if char >= '0' && char <= '9' {
			digits.WriteRune(char)
		}
	}

	number := digits.String()
	if len(number) == 10 && number[0] == '0' {
		number = "27" + number[1:]
	}

	if len(number) != 11 || !strings.HasPrefix(number, "27") {
		return "", apperr.Field("phone", "Enter a South African phone number.")
	}

	return "+" + number, nil
}

// Bank requires a complete bank set or no bank fields.
func Bank(holder, name, account, branch, kind string) (bool, error) {
	count := 0
	for _, value := range []string{holder, name, account, branch, kind} {
		if strings.TrimSpace(value) != "" {
			count++
		}
	}

	if count != 0 && count != 5 {
		return false, apperr.BadRequest("Complete all bank details or leave them all blank.", nil)
	}

	if kind != "" && !slices.Contains([]string{"Cheque", "Savings", "Transmission"}, kind) {
		return false, apperr.Field("bank_account_type", "Choose a valid account type.")
	}

	return count == 5, nil
}

// Address validates database enums before a user input can cause a SQL error.
func Address(province string, area *int) error {
	provinces := []string{"Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
		"Mpumalanga", "Northern Cape", "North West", "Western Cape"}
	if province != "" && !slices.Contains(provinces, province) {
		return apperr.Field("province", "Choose a province.")
	}

	if area != nil && (*area < 0 || *area > 9999) {
		return apperr.Field("area_code", "Enter a valid area code.")
	}

	return nil
}
