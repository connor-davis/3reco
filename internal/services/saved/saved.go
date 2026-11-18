// Package saved merges a person's saved listings, saved searches and followed
// stores into one newest-first list.
package saved

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	marketsvc "github.com/connor-davis/3reco/internal/services/market"
	storessvc "github.com/connor-davis/3reco/internal/services/stores"
	marketstore "github.com/connor-davis/3reco/internal/stores/market"
	savedstore "github.com/connor-davis/3reco/internal/stores/saved"
	searchstore "github.com/connor-davis/3reco/internal/stores/savedsearches"
	storesstore "github.com/connor-davis/3reco/internal/stores/stores"
)

// Item is one saved row. Exactly one of Listing, Search and Store is set,
// matching Kind. Each has the same shape as its own list.
type Item struct {
	Kind    string               `json:"kind"`
	ID      string               `json:"id"`
	SavedAt time.Time            `json:"saved_at"`
	Listing *marketstore.Listing `json:"listing,omitempty"`
	Search  *searchstore.Search  `json:"search,omitempty"`
	Store   *storesstore.Profile `json:"store,omitempty"`
}

// Result is a page of saved rows plus the person's totals for the chips.
type Result struct {
	paging.Page[Item]
	Counts savedstore.Counts `json:"counts"`
}

// Service builds the merged list.
type Service struct {
	store    *savedstore.Store
	searches *searchstore.Store
	market   *marketsvc.Service
	stores   *storessvc.Service
}

// New builds the service.
func New(
	store *savedstore.Store,
	searches *searchstore.Store,
	market *marketsvc.Service,
	stores *storessvc.Service,
) *Service {
	return &Service{store: store, searches: searches, market: market, stores: stores}
}

// List returns one page of the caller's saved rows. kind is "all", "listing",
// "search" or "store"; cursor and limit are the shared paging values. Every
// read is tied to userID, so nobody sees another person's rows.
func (s *Service) List(
	ctx context.Context,
	userID, partyID, kind, cursor, limit string,
) (Result, error) {
	switch kind {
	case "all", savedstore.KindListing, savedstore.KindSearch, savedstore.KindStore:
	default:
		return Result{}, apperr.BadRequest("Choose all, listing, search or store.", nil)
	}

	query, err := paging.Parse(cursor, limit, false)
	if err != nil {
		return Result{}, err
	}

	keys, err := s.store.Keys(ctx, userID, partyID, kind, query)
	if err != nil {
		return Result{}, err
	}

	counts, err := s.store.Count(ctx, userID, partyID)
	if err != nil {
		return Result{}, err
	}

	page := paging.Build(keys, query.Limit, func(key savedstore.Key) (time.Time, string) {
		return key.SavedAt, key.Kind + ":" + key.ID
	})

	items, err := s.hydrate(ctx, userID, partyID, page.Items)
	if err != nil {
		return Result{}, err
	}

	return Result{
		Page:   paging.Page[Item]{Items: items, NextCursor: page.NextCursor, HasMore: page.HasMore},
		Counts: counts,
	}, nil
}

// hydrate fills each key with the row from the store that owns it, in the
// order the keys came. A row that vanished since the keys were read is skipped.
func (s *Service) hydrate(
	ctx context.Context,
	userID, partyID string,
	keys []savedstore.Key,
) ([]Item, error) {
	ids := map[string][]string{}
	for _, key := range keys {
		ids[key.Kind] = append(ids[key.Kind], key.ID)
	}

	listings := map[string]*marketstore.Listing{}
	searches := map[string]*searchstore.Search{}
	profiles := map[string]*storesstore.Profile{}

	if len(ids[savedstore.KindListing]) > 0 {
		page, err := s.market.Listings(ctx, marketstore.Filter{
			IDs:      ids[savedstore.KindListing],
			ViewerID: partyID,
		}, paging.Query{Limit: len(ids[savedstore.KindListing])})
		if err != nil {
			return nil, err
		}

		for i := range page.Items {
			listings[page.Items[i].ID] = &page.Items[i]
		}
	}

	if len(ids[savedstore.KindSearch]) > 0 {
		found, err := s.searches.ByIDs(ctx, userID, ids[savedstore.KindSearch])
		if err != nil {
			return nil, err
		}

		for i := range found {
			searches[found[i].ID] = &found[i]
		}
	}

	if len(ids[savedstore.KindStore]) > 0 {
		found, err := s.stores.FollowedIn(ctx, userID, ids[savedstore.KindStore])
		if err != nil {
			return nil, err
		}

		for i := range found {
			profiles[found[i].ID] = &found[i]
		}
	}

	items := make([]Item, 0, len(keys))
	for _, key := range keys {
		item := Item{Kind: key.Kind, ID: key.ID, SavedAt: key.SavedAt}

		switch key.Kind {
		case savedstore.KindListing:
			item.Listing = listings[key.ID]
		case savedstore.KindSearch:
			item.Search = searches[key.ID]
		case savedstore.KindStore:
			item.Store = profiles[key.ID]
		}

		if item.Listing != nil || item.Search != nil || item.Store != nil {
			items = append(items, item)
		}
	}

	return items, nil
}
