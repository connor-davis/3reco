// Package notifications holds the HTTP handlers for the bell.
package notifications

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/paging"
	svc "github.com/connor-davis/3reco/internal/services/notifications"
)

// Handler serves the /api/notifications routes.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(s *svc.Service) *Handler { return &Handler{svc: s} }

// Register adds the routes. Every one needs a signed-in user and only ever
// touches that user's own messages.
func (h *Handler) Register(r fiber.Router) {
	r.Use(middleware.RequireUser)

	r.Get("/", h.list)
	r.Get("/unread-count", h.unreadCount)
	r.Post("/read-all", h.readAll)
	r.Patch("/:id/read", h.read)
	r.Delete("/:id", h.dismiss)
	r.Delete("/", h.dismissAll)
}

func ok(c fiber.Ctx) error { return c.JSON(fiber.Map{"ok": true}) }

func caller(c fiber.Ctx) string {
	user, _ := middleware.CurrentUser(c)

	return user.ID
}

func (h *Handler) list(c fiber.Ctx) error {
	page, err := h.svc.List(c.Context(), caller(c), c.Query("cursor"), paging.Limit(c.Query("limit")))
	if err != nil {
		return err
	}

	return c.JSON(page)
}

func (h *Handler) unreadCount(c fiber.Ctx) error {
	n, err := h.svc.UnreadCount(c.Context(), caller(c))
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"count": n})
}

func (h *Handler) readAll(c fiber.Ctx) error {
	if err := h.svc.MarkAllRead(c.Context(), caller(c)); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) read(c fiber.Ctx) error {
	if err := h.svc.MarkRead(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) dismiss(c fiber.Ctx) error {
	if err := h.svc.Dismiss(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) dismissAll(c fiber.Ctx) error {
	if err := h.svc.DismissAll(c.Context(), caller(c)); err != nil {
		return err
	}

	return ok(c)
}
