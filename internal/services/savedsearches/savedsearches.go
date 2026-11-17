// Package savedsearches validates personal material and price alerts.
package savedsearches

import (
	"context"
	"math/big"
	"regexp"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	store "github.com/connor-davis/3reco/internal/stores/savedsearches"
)

// Service owns saved search validation and caller scope.
type Service struct{ store *store.Store }

// New builds the service.
func New(rows *store.Store) *Service { return &Service{store: rows} }

// Input contains the market filters that affect alerts. Empty prices mean no bound.
type Input struct {
	MaterialID string `json:"material_id"`
	MinPrice   string `json:"min_price"`
	MaxPrice   string `json:"max_price"`
}

// price follows the market filter contract, keeping every digit exact.
var price = regexp.MustCompile(`^\d{1,9}(\.\d{1,4})?$`)

// Create validates and saves a search as the calling person.
func (s *Service) Create(ctx context.Context, userID string, in Input) (string, error) {
	if in.MaterialID == "" {
		return "", apperr.Field("material_id", "Choose a material to save this search.")
	}

	for field, value := range map[string]string{"min_price": in.MinPrice, "max_price": in.MaxPrice} {
		if value != "" && !price.MatchString(value) {
			return "", apperr.Field(field, "Enter a price in rand, like 12.50.")
		}
	}

	if in.MinPrice != "" && in.MaxPrice != "" {
		minPrice, _ := new(big.Rat).SetString(in.MinPrice)
		maxPrice, _ := new(big.Rat).SetString(in.MaxPrice)
		if minPrice.Cmp(maxPrice) > 0 {
			return "", apperr.Field("min_price", "The lowest price is above the highest.")
		}
	}

	id := database.NewID()
	found, err := s.store.Create(ctx, userID, store.Search{
		ID: id, MaterialID: in.MaterialID, MinPrice: in.MinPrice, MaxPrice: in.MaxPrice,
	})
	if err == nil && !found {
		return "", apperr.NotFound("No such material.")
	}

	return id, err
}

// List reads the caller's own searches.
func (s *Service) List(ctx context.Context, userID string) ([]store.Search, error) {
	return s.store.List(ctx, userID)
}

// Delete removes only the caller's own search. Old alerts stay.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	return s.store.Delete(ctx, userID, id)
}
