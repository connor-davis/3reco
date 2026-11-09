// Package materials serves the public catalog and admin mutations.
package materials

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	svc "github.com/connor-davis/3reco/internal/services/materials"
)

// Handler serves the material catalog.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds catalog routes under /api.
func (handler *Handler) Register(router fiber.Router) {
	router.Get("/materials", handler.list)
	router.Get("/materials/:id", handler.find)
	router.Post("/admin/materials", middleware.RequireRole("admin"), handler.save)
	router.Patch("/admin/materials/:id", middleware.RequireRole("admin"), handler.save)
	router.Delete("/admin/materials/:id", middleware.RequireRole("admin"), handler.remove)
}
