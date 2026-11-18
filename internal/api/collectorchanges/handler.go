// Package collectorchanges serves the staff queue of proposed collector edits.
package collectorchanges

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
	svc "github.com/connor-davis/3reco/internal/services/collectorchanges"
)

// Handler serves the review routes, for admins and staff only.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds the queue and its two outcomes under /api/admin.
func (handler *Handler) Register(router fiber.Router) {
	staff := middleware.RequireRole(auth.RoleAdmin, auth.RoleStaff)
	router.Get("/admin/collector-changes", staff, handler.queue)
	router.Post("/admin/collector-changes/:id/approve", staff, handler.approve)
	router.Post("/admin/collector-changes/:id/reject", staff, handler.reject)
}

func (handler *Handler) queue(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	items, err := handler.svc.Queue(c.Context(), user)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"items": items})
}

func (handler *Handler) approve(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.Approve(c.Context(), user, c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (handler *Handler) reject(c fiber.Ctx) error {
	var in struct {
		Reason string `json:"reason"`
	}

	// The reason is optional, so an empty body is fine.
	if len(c.Body()) > 0 {
		if err := c.Bind().JSON(&in); err != nil {
			return apperr.BadRequest("Send a JSON body.", nil)
		}
	}

	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.Reject(c.Context(), user, c.Params("id"), in.Reason); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
