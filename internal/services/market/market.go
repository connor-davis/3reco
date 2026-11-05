// Package market applies public marketplace and private cart rules.
package market

import (
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/reviews"
	store "github.com/connor-davis/3reco/internal/stores/market"
)

// Service owns marketplace rules.
type Service struct {
	db      *database.DB
	store   *store.Store
	reviews *reviews.Service
}

// New builds the service.
func New(db *database.DB, rows *store.Store, reviewService *reviews.Service) *Service {
	return &Service{db: db, store: rows, reviews: reviewService}
}
