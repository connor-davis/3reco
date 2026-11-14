// Package admin holds the HTTP handlers for user management and dashboards.
package admin

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	svc "github.com/connor-davis/3reco/internal/services/admin"
	"github.com/connor-davis/3reco/internal/services/auth"
)

// Handler serves the admin and dashboard routes.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(s *svc.Service) *Handler { return &Handler{svc: s} }

// Register adds the routes to the /api router. Each route carries its own role
// check instead of a whole /admin group, so other owners can add /admin routes
// with different roles.
func (h *Handler) Register(api fiber.Router) {
	admin := middleware.RequireRole(auth.RoleAdmin)

	api.Get("/admin/duplicates", admin, h.duplicates)
	api.Post("/admin/duplicates/dismiss", admin, h.dismissDuplicates)
	api.Post("/admin/duplicates/:id/mark", admin, h.markDuplicate)
	api.Post("/admin/duplicates/:id/undo", admin, h.undoDuplicate)

	api.Get("/admin/users", admin, h.users)
	api.Delete("/admin/users/:id", admin, h.remove)
	api.Patch("/admin/users/:id/role", admin, h.setRole)
	api.Put("/admin/users/:id/business-verification", admin, h.setBusinessVerified)
	api.Get("/admin/exports/users", middleware.RequireUser, h.export("users"))
	api.Get("/admin/exports/transactions", middleware.RequireUser, h.export("transactions"))
	api.Get("/exports/collections", middleware.RequireUser, h.export("collections"))
	api.Get("/exports/purchases", middleware.RequireUser, h.export("purchases"))
	api.Get("/exports/sales", middleware.RequireUser, h.export("sales"))

	api.Get("/admin/dashboard", middleware.RequireRole(auth.RoleAdmin, auth.RoleStaff), h.admin)
	api.Get("/dashboard/business", middleware.RequireRole(auth.RoleBusiness), h.business)
	api.Get("/dashboard/collector", middleware.RequireRole(auth.RoleCollector), h.collector)
}

func caller(c fiber.Ctx) auth.User {
	user, _ := middleware.CurrentUser(c)

	return user
}

func (h *Handler) users(c fiber.Ctx) error {
	page, err := h.svc.Users(c.Context(), caller(c), c.Query("cursor"),
		paging.Limit(c.Query("limit")), c.Query("q"), c.Query("role"))
	if err != nil {
		return err
	}

	return c.JSON(page)
}

func (h *Handler) remove(c fiber.Ctx) error {
	if err := h.svc.Remove(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) setRole(c fiber.Ctx) error {
	var in struct {
		Role string `json:"role"`
	}

	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	if err := h.svc.SetRole(c.Context(), caller(c), c.Params("id"), in.Role); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) setBusinessVerified(c fiber.Ctx) error {
	var in struct {
		Verified *bool `json:"verified"`
	}

	if err := c.Bind().JSON(&in); err != nil || in.Verified == nil {
		return apperr.BadRequest("Send {\"verified\": true} or {\"verified\": false}.", nil)
	}

	if err := h.svc.SetBusinessVerified(c.Context(), caller(c), c.Params("id"), *in.Verified); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) admin(c fiber.Ctx) error {
	d, err := h.svc.Admin(c.Context(), caller(c), c.Query("from"), c.Query("to"))
	if err != nil {
		return err
	}

	return c.JSON(d)
}

func (h *Handler) business(c fiber.Ctx) error {
	d, err := h.svc.Business(c.Context(), caller(c), c.Query("from"), c.Query("to"))
	if err != nil {
		return err
	}

	return c.JSON(d)
}

func (h *Handler) collector(c fiber.Ctx) error {
	d, err := h.svc.Collector(c.Context(), caller(c), c.Query("from"), c.Query("to"))
	if err != nil {
		return err
	}

	return c.JSON(d)
}
