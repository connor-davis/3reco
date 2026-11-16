package stores

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	store "github.com/connor-davis/3reco/internal/stores/stores"
)

// Find reads one active business profile with stock and review summaries.
func (service *Service) Find(ctx context.Context, id, viewer string) (store.Profile, error) {
	item, err := service.store.Find(ctx, id, viewer)
	if errors.Is(err, pgx.ErrNoRows) {
		return item, apperr.NotFound("No such store.")
	}

	if err != nil {
		return item, err
	}

	summary, err := service.reviews.Summary(ctx, id)
	item.AverageRating, item.ReviewCount = summary.Average, summary.Count

	return item, err
}

// List excludes the caller's own business before paging.
func (service *Service) List(ctx context.Context, search, exclude string, query paging.Query) (paging.Page[store.Profile], error) {
	items, err := service.store.List(ctx, search, exclude, query)
	if err != nil {
		return paging.Page[store.Profile]{}, err
	}

	// One query for the whole page, not one per store.
	sellerIDs := make([]string, len(items))
	for i := range items {
		sellerIDs[i] = items[i].ID
	}

	summaries, err := service.reviews.SummaryMany(ctx, sellerIDs)
	if err != nil {
		return paging.Page[store.Profile]{}, err
	}

	// A store missing from the map has no reviews: zero count, no average.
	for i := range items {
		summary := summaries[items[i].ID]
		items[i].AverageRating, items[i].ReviewCount = summary.Average, summary.Count
	}

	return paging.Build(
		items,
		query.Limit,
		func(item store.Profile) (time.Time, string) {
			return item.CreatedAt, item.ID
		},
	), nil
}
