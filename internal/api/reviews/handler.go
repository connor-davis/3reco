// Package reviews holds the HTTP handlers for store reviews.
package reviews

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	svc "github.com/connor-davis/3reco/internal/services/reviews"
)

// Handler serves the review routes.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(s *svc.Service) *Handler { return &Handler{svc: s} }

// Register adds the routes to the /api router. Reading a store's reviews is
// public; writing needs a user, and removing needs an admin.
func (h *Handler) Register(api fiber.Router) {
	api.Get("/stores/:seller_id/reviews", h.bySeller)
	api.Get("/stores/:seller_id/reviews/summary", h.summary)

	api.Get("/reviews/reviewable", middleware.RequireUser, h.reviewable)
	api.Post("/transactions/:id/review", middleware.RequireBusiness("manager"), h.add)
	api.Delete("/admin/reviews/:id", middleware.RequireRole(auth.RoleAdmin), h.remove)
}

func caller(c fiber.Ctx) auth.User {
	user, _ := middleware.CurrentUser(c)

	return user
}

func (h *Handler) bySeller(c fiber.Ctx) error {
	page, err := h.svc.BySeller(c.Context(), c.Params("seller_id"), c.Query("cursor"),
		paging.Limit(c.Query("limit")))
	if err != nil {
		return err
	}

	return c.JSON(page)
}

func (h *Handler) summary(c fiber.Ctx) error {
	sum, err := h.svc.Summary(c.Context(), c.Params("seller_id"))
	if err != nil {
		return err
	}

	return c.JSON(sum)
}

func (h *Handler) reviewable(c fiber.Ctx) error {
	items, err := h.svc.Reviewable(c.Context(), auth.PartyID(caller(c)), c.Query("seller_id"))
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"items": items})
}

func (h *Handler) add(c fiber.Ctx) error {
	var in struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}

	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	id, err := h.svc.Add(c.Context(), auth.PartyID(caller(c)), c.Params("id"), in.Rating, in.Comment)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"id": id})
}

func (h *Handler) remove(c fiber.Ctx) error {
	if err := h.svc.Remove(c.Context(), c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
