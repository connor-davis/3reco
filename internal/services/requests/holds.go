package requests

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/services/notifications"
	store "github.com/connor-davis/3reco/internal/stores/requests"
)

const offerHoldLifetime = 48 * time.Hour

// ExpireOffers releases expired offers and tells both parties in the same transaction.
func (s *Service) ExpireOffers(ctx context.Context) error {
	return s.db.InTx(ctx, func(ctx context.Context) error {
		expired, err := s.store.ExpireOffers(ctx)
		if err != nil {
			return err
		}

		for _, r := range expired {
			for _, userID := range []string{r.Buyer.ID, r.Seller.ID} {
				err := s.notes.Notify(
					ctx,
					userID,
					notifications.RequestCancelled,
					"Offer ran out",
					"The stock hold ran out. Either side can make a new offer if stock is available.",
					"/market/"+r.ID,
				)
				if err != nil {
					return err
				}
			}
		}

		return nil
	})
}

func (s *Service) reserveRequestedHolds(ctx context.Context, r store.Request) error {
	// Share creation's material order; ReserveHold locks each material's stock by ID.
	items := slices.Clone(r.Items)
	slices.SortFunc(items, func(a, b store.Item) int {
		return strings.Compare(a.MaterialID, b.MaterialID)
	})

	for _, item := range items {
		// Imported requests may have no requested terms to restore.
		if item.RequestedWeight == nil {
			continue
		}

		held, err := s.store.ReserveHold(
			ctx,
			r,
			item.MaterialID,
			*item.RequestedWeight,
			offerHoldLifetime,
		)
		if err != nil {
			return err
		}

		// Stock can sell while the offer holds less than the original request.
		// Keep negotiation open, but never leave a partially reserved request.
		if !held {
			return s.store.ReleaseHolds(ctx, r.ID)
		}
	}

	return nil
}
