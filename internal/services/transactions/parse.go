package transactions

import (
	"math/big"
	"regexp"
	"slices"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
)

// SaleItem is one material line of a sale or an offer, as the API receives
// it. Weight and price are decimal strings, never floats.
type SaleItem struct {
	MaterialID string `json:"material_id"`
	Weight     string `json:"weight"`
	Price      string `json:"price"`
}

const maxItems = 100

// Up to 12 digits before the point and 6 after: far more than a scrap yard
// needs, and small enough that no sum can overflow a Postgres numeric.
var decimalPattern = regexp.MustCompile(`^\d{1,12}(\.\d{1,6})?$`)

func parseDecimal(field, raw string) (*big.Rat, error) {
	if !decimalPattern.MatchString(raw) {
		return nil, apperr.Field(field, "Enter a number such as 12.5.")
	}

	value, ok := new(big.Rat).SetString(raw)
	if !ok {
		return nil, apperr.Field(field, "Enter a number such as 12.5.")
	}

	return value, nil
}

// CheckItems validates the shape of a sale or offer before anything is
// written: not empty, every weight above zero, every price a decimal, and no
// material twice.
func CheckItems(items []SaleItem) error {
	if len(items) == 0 {
		return apperr.Field("items", "Add at least one material.")
	}

	if len(items) > maxItems {
		return apperr.Field("items", "Too many materials in one go.")
	}

	seen := make([]string, 0, len(items))

	for _, item := range items {
		if item.MaterialID == "" {
			return apperr.Field("items", "Every line needs a material.")
		}

		if slices.Contains(seen, item.MaterialID) {
			return apperr.Field("items", "Each material can only appear once.")
		}

		seen = append(seen, item.MaterialID)

		weight, err := parseDecimal("weight", item.Weight)
		if err != nil {
			return err
		}

		if weight.Sign() <= 0 {
			return apperr.Field("weight", "Weight must be more than zero.")
		}

		if _, err := parseDecimal("price", item.Price); err != nil {
			return err
		}
	}

	return nil
}

// parseDay checks a YYYY-MM-DD collection day is a real calendar date.
func parseDay(raw string) error {
	if _, err := time.Parse("2006-01-02", raw); err != nil {
		return apperr.Field("collection_day", "Use a real date in YYYY-MM-DD format.")
	}

	return nil
}
