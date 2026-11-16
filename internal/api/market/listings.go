package market

import (
	"strconv"

	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	store "github.com/connor-davis/3reco/internal/stores/market"
)

func (handler *Handler) listings(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	// Whole-number km; anything else is a bad request, not a silent zero.
	km := 0
	if raw := c.Query("max_km"); raw != "" {
		var err error
		if km, err = strconv.Atoi(raw); err != nil {
			return apperr.Field("max_km", "Choose 10, 25, 50 or 100 km.")
		}
	}

	return handler.list(
		c,
		store.Filter{SellerID: c.Query("seller_id"), MaterialID: c.Query("material_id"),
			Search: c.Query("q"), ExcludeOwner: auth.PartyID(user), ViewerID: auth.PartyID(user),
			MinPrice: c.Query("min_price"), MaxPrice: c.Query("max_price"), MaxKm: km},
	)
}

// distance tells the web if the distance filter can work for this caller.
func (handler *Handler) distance(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	status, err := handler.svc.DistanceStatus(c.Context(), auth.PartyID(user))
	if err != nil {
		return err
	}

	return c.JSON(status)
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
