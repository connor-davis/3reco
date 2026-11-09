package transactions

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
	store "github.com/connor-davis/3reco/internal/stores/transactions"
)

// BeginOffer writes the agreed terms without moving stock or queuing an invoice.
// The caller holds the request lock and has checked its live reservations.
func (s *Service) BeginOffer(
	ctx context.Context,
	sellerID, buyerID, requestID string,
	version int,
	items []SaleItem,
) (string, error) {
	id := database.NewID()
	err := s.store.Insert(ctx, store.NewTransaction{
		ID: id, SellerID: sellerID, BuyerID: buyerID, Type: "b2b", Status: "pending",
		RequestID: &requestID, OfferVersion: &version,
	})
	if err != nil {
		return "", err
	}

	for position, item := range items {
		err := s.store.InsertItem(ctx, id, position, item.MaterialID, item.Weight, item.Price)
		if err != nil {
			return "", err
		}
	}

	return id, s.store.SetTotal(ctx, id)
}

// CompleteOffer settles the same pending row after both parties confirm its version.
func (s *Service) CompleteOffer(
	ctx context.Context,
	sellerID, buyerID, requestID string,
	version int,
	items []SaleItem,
) (string, error) {
	id, err := s.store.PendingID(ctx, requestID, version)
	if err != nil {
		return "", err
	}

	return s.settle(ctx, sellerID, buyerID, requestID, items, false, id)
}
