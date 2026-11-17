package stats

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
	store "github.com/connor-davis/3reco/internal/stores/stats"
)

// PriceHistory allows business members and platform staff to read anonymous
// weekly trends. Five completed b2b deals from three selling stores are needed
// in each week; callers cannot request smaller buckets or lower thresholds.
func (service *Service) PriceHistory(
	ctx context.Context,
	user auth.User,
	materialID string,
) ([]store.PriceWeek, error) {
	if !auth.HasRole(user, "business", "admin", "staff") {
		return nil, apperr.Forbidden("Only businesses and staff may see price trends.")
	}

	const minimumDeals, minimumStores = 5, 3
	weeks, err := service.records.PriceHistory(ctx, materialID, minimumDeals, minimumStores)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("No such material.")
	}

	return weeks, err
}
