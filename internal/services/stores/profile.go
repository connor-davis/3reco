package stores

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
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
	if err != nil {
		return item, err
	}

	item.AverageRating, item.ReviewCount = summary.Average, summary.Count
	replies, err := service.stats.Replies(ctx, id)
	if err != nil {
		return item, err
	}

	badge := replies.UsuallyWithinDay()
	item.UsuallyRepliesWithinDay = &badge

	return item, err
}

// List excludes the caller's own business before paging. Only staff may include
// unverified businesses in the directory.
func (service *Service) List(
	ctx context.Context,
	user auth.User,
	search string,
	query paging.Query,
	all bool,
) (paging.Page[store.Profile], error) {
	if all && !auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff) {
		return paging.Page[store.Profile]{}, apperr.Forbidden("Only staff can list all businesses.")
	}

	items, err := service.store.List(ctx, search, auth.PartyID(user), query, all)
	if err != nil {
		return paging.Page[store.Profile]{}, err
	}

	return service.page(ctx, items, query)
}

// Followed lists the stores the caller follows, with the same summaries.
func (service *Service) Followed(ctx context.Context, userID string, query paging.Query) (paging.Page[store.Profile], error) {
	items, err := service.store.Followed(ctx, userID, query)
	if err != nil {
		return paging.Page[store.Profile]{}, err
	}

	return service.page(ctx, items, query)
}

// FollowedIn returns the named stores the caller follows, with the same
// summaries as Followed. Stores the caller can't see are left out.
func (service *Service) FollowedIn(ctx context.Context, userID string, ids []string) ([]store.Profile, error) {
	items, err := service.store.FollowedIn(ctx, userID, ids)
	if err != nil {
		return nil, err
	}

	page, err := service.page(ctx, items, paging.Query{Limit: len(ids)})

	return page.Items, err
}

func (service *Service) page(ctx context.Context, items []store.Profile, query paging.Query) (paging.Page[store.Profile], error) {
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
