package market

import (
	"context"
	"math/big"
	"regexp"
	"slices"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/geo"
	store "github.com/connor-davis/3reco/internal/stores/market"
)

// DistancePresets are the km choices the distance filter accepts.
var DistancePresets = []int{10, 25, 50, 100}

// price is an exact decimal in R/kg: no sign, no exponent, no float.
var price = regexp.MustCompile(`^\d{1,9}(\.\d{1,4})?$`)

// Distance tells the web whether the distance filter can work for the caller.
type Distance struct {
	Enabled   bool `json:"enabled"`
	HasOrigin bool `json:"has_origin"`
}

// DistanceStatus says if a map service is set up and if the caller's business
// has a map point to measure from.
func (service *Service) DistanceStatus(ctx context.Context, viewer string) (Distance, error) {
	status := Distance{Enabled: geo.Enabled(service.geocoder)}
	if !status.Enabled || viewer == "" {
		return status, nil
	}

	lat, _, err := service.store.Origin(ctx, viewer)
	status.HasOrigin = lat != nil

	return status, err
}

// prepare checks the price range and distance, and fills in the caller's own
// map point as the origin. It never lets a caller measure from someone else.
func (service *Service) prepare(ctx context.Context, filter store.Filter) (store.Filter, error) {
	for field, value := range map[string]string{"min_price": filter.MinPrice, "max_price": filter.MaxPrice} {
		if value != "" && !price.MatchString(value) {
			return filter, apperr.Field(field, "Enter a price in rand, like 12.50.")
		}
	}

	if filter.MinPrice != "" && filter.MaxPrice != "" && decimal(filter.MinPrice).Cmp(decimal(filter.MaxPrice)) > 0 {
		return filter, apperr.Field("min_price", "The lowest price is above the highest.")
	}

	if filter.MaxKm == 0 {
		return filter, nil
	}

	if !slices.Contains(DistancePresets, filter.MaxKm) {
		return filter, apperr.Field("max_km", "Choose 10, 25, 50 or 100 km.")
	}

	if !geo.Enabled(service.geocoder) {
		return filter, apperr.Field("max_km", "Distance search is not available yet.")
	}

	if filter.ViewerID == "" {
		return filter, apperr.Field("max_km", "Add your business address to search by distance.")
	}

	lat, lng, err := service.store.Origin(ctx, filter.ViewerID)
	if err != nil {
		return filter, err
	}

	if lat == nil {
		return filter, apperr.Field("max_km", "Add your business address to search by distance.")
	}

	filter.OriginLat, filter.OriginLng = lat, lng

	return filter, nil
}

func decimal(text string) *big.Rat {
	value, _ := new(big.Rat).SetString(text)

	return value
}
