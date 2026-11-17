// Package moderation serves business blocks and private reports.
package moderation

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
	svc "github.com/connor-davis/3reco/internal/services/moderation"
)

// Handler serves moderation routes with caller and admin checks.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds caller-scoped and individually guarded admin routes.
func (h *Handler) Register(r fiber.Router) {
	blocks := r.Group("/blocks", middleware.RequireUser)
	blocks.Get("/", h.blocks)
	blocks.Put("/:id", middleware.RequireBusiness("manager"), h.block)
	blocks.Delete("/:id", middleware.RequireBusiness("manager"), h.unblock)

	reports := r.Group("/reports", middleware.RequireUser)
	reports.Get("/", h.mine)
	reports.Post("/", middleware.RequireBusiness("manager"), h.report)

	r.Get("/admin/reports", middleware.RequireRole(auth.RoleAdmin), h.queue)
	r.Post("/admin/reports/:id/resolve", middleware.RequireRole(auth.RoleAdmin), h.resolve)
	r.Post("/admin/businesses/:id/unsuspend", middleware.RequireRole(auth.RoleAdmin), h.unsuspend)
}

func (h *Handler) blocks(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	items, err := h.svc.Blocks(c.Context(), user)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"items": items})
}

func (h *Handler) block(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Block(c.Context(), user, c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) unblock(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Unblock(c.Context(), user, c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) report(c fiber.Ctx) error {
	var in svc.Input
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	id, err := h.svc.Report(c.Context(), user, in)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"id": id})
}

func (h *Handler) mine(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	items, err := h.svc.Mine(c.Context(), user)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"items": items})
}

func (h *Handler) queue(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	items, err := h.svc.Queue(c.Context(), user)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"items": items})
}

func (h *Handler) resolve(c fiber.Ctx) error {
	var in struct {
		Action string `json:"action"`
	}
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Resolve(c.Context(), user, c.Params("id"), in.Action); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) unsuspend(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Unsuspend(c.Context(), user, c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
