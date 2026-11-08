package stock

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/database"
	store "github.com/connor-davis/3reco/internal/stores/stock"
)

func (service *Service) notifyListing(ctx context.Context, item store.Item) error {
	kind, title, visibility := "stock_unlisted", "Stock hidden from the market", "hidden from"
	if item.IsListed {
		kind, title, visibility = "stock_listed", "Stock listed on market", "visible on"
	}

	body := "Your " + item.MaterialName + " stock is now " + visibility + " the market."

	return service.store.NotifyListing(ctx, database.NewID(), item.OwnerID, kind, title, body)
}
