// Package quickreplies serves a person's saved chat replies.
package quickreplies

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	svc "github.com/connor-davis/3reco/internal/services/quickreplies"
)

// Handler serves quick reply routes, scoped to the signed-in person.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds signed-in routes under /api.
func (h *Handler) Register(r fiber.Router) {
	replies := r.Group("/quick-replies", middleware.RequireUser)
	replies.Get("/", h.list)
	replies.Post("/", h.create)
	replies.Patch("/:id", h.update)
	replies.Delete("/:id", h.remove)
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

func (h *Handler) update(c fiber.Ctx) error {
	var in svc.Input
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Update(c.Context(), user.ID, c.Params("id"), in); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) remove(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Delete(c.Context(), user.ID, c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
