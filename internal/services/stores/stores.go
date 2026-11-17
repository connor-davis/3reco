// Package stores serves active business stores through safe projections.
package stores

import (
	"github.com/connor-davis/3reco/internal/services/reviews"
	"github.com/connor-davis/3reco/internal/stores/stats"
	store "github.com/connor-davis/3reco/internal/stores/stores"
)

// Service owns public store rules and uses the review area's aggregate owner.
type Service struct {
	store   *store.Store
	reviews *reviews.Service
	stats   *stats.Store
}

// New builds the service.
func New(rows *store.Store, reviewService *reviews.Service, metrics *stats.Store) *Service {
	return &Service{store: rows, reviews: reviewService, stats: metrics}
}
