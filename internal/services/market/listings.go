package market

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	store "github.com/connor-davis/3reco/internal/stores/market"
)

// Listings returns safe listed stock, with all filters applied before seeking.
func (service *Service) Listings(ctx context.Context, filter store.Filter, query paging.Query) (paging.Page[store.Listing], error) {
	items, err := service.store.Listings(ctx, filter, query)
	if err != nil {
		return paging.Page[store.Listing]{}, err
	}

	for i := range items {
		summary, err := service.reviews.Summary(ctx, items[i].SellerID)
		if err != nil {
			return paging.Page[store.Listing]{}, err
		}

		items[i].AverageRating, items[i].ReviewCount = summary.Average, summary.Count
	}

	return paging.Build(
		items,
		query.Limit,
		func(item store.Listing) (time.Time, string) {
			return item.CreatedAt, item.ID
		},
	), nil
}

// Detail hides stock immediately when it is unlisted.
func (service *Service) Detail(ctx context.Context, id, viewer string) (store.Listing, error) {
	item, err := service.store.Listing(ctx, id, viewer)
	if errors.Is(err, pgx.ErrNoRows) {
		return item, apperr.NotFound("No such listing.")
	}

	if err != nil {
		return item, err
	}

	summary, err := service.reviews.Summary(ctx, item.SellerID)
	item.AverageRating, item.ReviewCount = summary.Average, summary.Count

	return item, err
}

// RequireVerified refuses a purchase from a business that is not verified yet.
// Reads stay open so people can still cancel what they already started.
func RequireVerified(ctx context.Context, records *store.Store, sellerID string) error {
	unverified, err := records.Unverified(ctx, sellerID)
	if err != nil {
		return err
	}

	if unverified {
		return apperr.Forbidden("This business is not verified to trade yet.")
	}

	return nil
}
