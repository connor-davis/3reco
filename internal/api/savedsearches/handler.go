// Package savedsearches serves personal saved material and price searches.
package savedsearches

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	svc "github.com/connor-davis/3reco/internal/services/savedsearches"
)

// Handler serves saved search routes, scoped to the signed-in person.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds signed-in routes under /api.
func (h *Handler) Register(r fiber.Router) {
	searches := r.Group("/saved-searches", middleware.RequireUser)
	searches.Get("/", h.list)
	searches.Post("/", h.create)
	searches.Delete("/:id", h.remove)
}

func (h *Handler) list(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	items, err := h.svc.List(c.Context(), user.ID)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"items": items})
}

func (h *Handler) create(c fiber.Ctx) error {
	var in svc.Input
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	id, err := h.svc.Create(c.Context(), user.ID, in)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

func (h *Handler) remove(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Delete(c.Context(), user.ID, c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
