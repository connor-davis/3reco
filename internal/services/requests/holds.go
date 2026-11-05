package requests

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/services/notifications"
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
					"This offer ran out. The seller can make a new offer.",
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
