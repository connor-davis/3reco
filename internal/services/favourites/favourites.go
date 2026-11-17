// Package favourites holds the rules for saving listings and following
// stores. Everything is scoped to the caller; an id sent in a request is only
// ever the target, never the owner.
package favourites

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/moderation"
	store "github.com/connor-davis/3reco/internal/stores/favourites"
	marketstore "github.com/connor-davis/3reco/internal/stores/market"
	storesstore "github.com/connor-davis/3reco/internal/stores/stores"
)

// Service is the favourites and follows rules.
type Service struct {
	db       *database.DB
	store    *store.Store
	listings *marketstore.Store
	stores   *storesstore.Store
}

// New builds the service.
func New(db *database.DB, rows *store.Store, listings *marketstore.Store, stores *storesstore.Store) *Service {
	return &Service{db: db, store: rows, listings: listings, stores: stores}
}

// Favourite saves a listing the caller can currently see on the market. A
// hidden, unlisted or missing one is a 404, so ids are not leaked. party is
// the caller's active business, if any, which may see its own stock.
func (s *Service) Favourite(ctx context.Context, userID, party, stockID string) error {
	_, err := s.listings.Listing(ctx, stockID, party)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.NotFound("No such listing.")
	}

	if err != nil {
		return err
	}

	return s.store.AddFavourite(ctx, userID, stockID)
}

// Unfavourite removes the caller's own saved listing. Nothing to remove is fine.
func (s *Service) Unfavourite(ctx context.Context, userID, stockID string) error {
	return s.store.RemoveFavourite(ctx, userID, stockID)
}

// FavouriteIDs lists the caller's saved listing ids.
func (s *Service) FavouriteIDs(ctx context.Context, userID string) ([]string, error) {
	return s.store.FavouriteIDs(ctx, userID)
}

// Follow follows a real, visible store. Following your own store is refused:
// you would be alerted about your own listings.
func (s *Service) Follow(ctx context.Context, userID, party, storeID string) error {
	if storeID == userID || storeID == party {
		return apperr.BadRequest("You can't follow your own store.", nil)
	}

	if err := moderation.RequireContact(ctx, s.db, party, storeID); err != nil {
		return err
	}

	_, err := s.stores.Find(ctx, storeID, party)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.NotFound("No such store.")
	}

	if err != nil {
		return err
	}

	return s.store.AddFollow(ctx, userID, storeID)
}

// Unfollow removes the caller's own follow. Old alerts stay in the bell.
func (s *Service) Unfollow(ctx context.Context, userID, storeID string) error {
	return s.store.RemoveFollow(ctx, userID, storeID)
}

// FollowIDs lists the caller's followed store ids.
func (s *Service) FollowIDs(ctx context.Context, userID string) ([]string, error) {
	return s.store.FollowIDs(ctx, userID)
}
