package stats

import (
	"context"

	"github.com/connor-davis/3reco/internal/services/auth"
	store "github.com/connor-davis/3reco/internal/stores/stats"
)

// Seller returns only the active business's private performance, for any team role.
func (service *Service) Seller(ctx context.Context, user auth.User) (store.SellerStats, error) {
	if err := auth.RequireBusiness(user, "member"); err != nil {
		return store.SellerStats{}, err
	}

	return service.records.Seller(ctx, auth.PartyID(user))
}
