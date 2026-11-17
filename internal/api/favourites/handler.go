// Package favourites holds the HTTP handlers for saved listings and followed
// stores. Every route needs a signed-in user and only touches that person's
// own rows.
package favourites

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	svc "github.com/connor-davis/3reco/internal/services/favourites"
	marketsvc "github.com/connor-davis/3reco/internal/services/market"
	storessvc "github.com/connor-davis/3reco/internal/services/stores"
	marketstore "github.com/connor-davis/3reco/internal/stores/market"
)

// Handler serves the /api/favourites and /api/follows routes.
type Handler struct {
	svc    *svc.Service
	market *marketsvc.Service
	stores *storessvc.Service
}

// New builds the handler.
func New(s *svc.Service, market *marketsvc.Service, stores *storessvc.Service) *Handler {
	return &Handler{svc: s, market: market, stores: stores}
}

// Register adds the routes under /api.
func (h *Handler) Register(r fiber.Router) {
	fav := r.Group("/favourites", middleware.RequireUser)
	fav.Get("/", h.listings)
	fav.Get("/ids", h.favouriteIDs)
	fav.Put("/:id", h.favourite)
	fav.Delete("/:id", h.unfavourite)

	follow := r.Group("/follows", middleware.RequireUser)
	follow.Get("/", h.followed)
	follow.Get("/ids", h.followIDs)
	follow.Put("/:id", h.follow)
	follow.Delete("/:id", h.unfollow)
}

func ok(c fiber.Ctx) error { return c.JSON(fiber.Map{"ok": true}) }

func ids(c fiber.Ctx, list []string, err error) error {
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ids": list})
}

// listings shows the caller's saved listings that are still on the market.
func (h *Handler) listings(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	query, err := paging.Parse(c.Query("cursor"), c.Query("limit"), false)
	if err != nil {
		return err
	}

	page, err := h.market.Listings(c.Context(), marketstore.Filter{
		FavouriteOf: user.ID,
		ViewerID:    auth.PartyID(user),
	}, query)
	if err != nil {
		return err
	}

	return c.JSON(page)
}

func (h *Handler) favouriteIDs(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	list, err := h.svc.FavouriteIDs(c.Context(), user.ID)

	return ids(c, list, err)
}

func (h *Handler) favourite(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	if err := h.svc.Favourite(c.Context(), user.ID, auth.PartyID(user), c.Params("id")); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) unfavourite(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	if err := h.svc.Unfavourite(c.Context(), user.ID, c.Params("id")); err != nil {
		return err
	}

	return ok(c)
}

// followed shows the stores the caller follows.
func (h *Handler) followed(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	query, err := paging.Parse(c.Query("cursor"), c.Query("limit"), false)
	if err != nil {
		return err
	}

	page, err := h.stores.Followed(c.Context(), user.ID, query)
	if err != nil {
		return err
	}

	return c.JSON(page)
}

func (h *Handler) followIDs(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	list, err := h.svc.FollowIDs(c.Context(), user.ID)

	return ids(c, list, err)
}

func (h *Handler) follow(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	if err := h.svc.Follow(c.Context(), user.ID, auth.PartyID(user), c.Params("id")); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) unfollow(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	if err := h.svc.Unfollow(c.Context(), user.ID, c.Params("id")); err != nil {
		return err
	}

	return ok(c)
}
