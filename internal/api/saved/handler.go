// Package saved holds the HTTP handler for the Saved page: one list of the
// caller's saved listings, saved searches and followed stores. It needs a
// signed-in user and only reads that person's own rows.
package saved

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/services/auth"
	svc "github.com/connor-davis/3reco/internal/services/saved"
)

// Handler serves GET /api/saved.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(s *svc.Service) *Handler { return &Handler{svc: s} }

// Register adds the route under /api.
func (h *Handler) Register(r fiber.Router) {
	r.Get("/saved", middleware.RequireUser, h.list)
}

// list answers with one page of the caller's saved rows and their totals.
func (h *Handler) list(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	kind := c.Query("type", "all")

	result, err := h.svc.List(
		c.Context(), user.ID, auth.PartyID(user), kind, c.Query("cursor"), c.Query("limit"),
	)
	if err != nil {
		return err
	}

	return c.JSON(result)
}
