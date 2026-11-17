// Package push serves the phone alert routes, scoped to the signed-in person.
package push

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	svc "github.com/connor-davis/3reco/internal/services/push"
)

// Handler serves push routes.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds signed-in routes under /api.
func (h *Handler) Register(r fiber.Router) {
	push := r.Group("/push", middleware.RequireUser)
	push.Get("/key", h.key)
	push.Post("/subscriptions", h.subscribe)
	push.Post("/unsubscribe", h.unsubscribe)
}

func (h *Handler) key(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"enabled": h.svc.Enabled(), "public_key": h.svc.PublicKey()})
}

func (h *Handler) subscribe(c fiber.Ctx) error {
	var in svc.Input
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Subscribe(c.Context(), user.ID, in); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) unsubscribe(c fiber.Ctx) error {
	var in struct {
		Endpoint string `json:"endpoint"`
	}
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Unsubscribe(c.Context(), user.ID, in.Endpoint); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
