package market

import (
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/paging"
	store "github.com/connor-davis/3reco/internal/stores/market"
)

func (handler *Handler) listings(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	return handler.list(
		c,
		store.Filter{SellerID: c.Query("seller_id"), MaterialID: c.Query("material_id"),
			Search: c.Query("q"), ExcludeOwner: auth.PartyID(user), ViewerID: auth.PartyID(user)},
	)
}

func (handler *Handler) sellerListings(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	return handler.list(c, store.Filter{SellerID: c.Params("id"), ViewerID: auth.PartyID(user)})
}

func (handler *Handler) list(c fiber.Ctx, filter store.Filter) error {
	query, err := paging.Parse(c.Query("cursor"), c.Query("limit"), false)
	if err != nil {
		return err
	}

	items, err := handler.svc.Listings(c.Context(), filter, query)
	if err != nil {
		return err
	}

	return c.JSON(items)
}
