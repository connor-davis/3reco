// Package collectors serves managed collector records and scoped statistics.
package collectors

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/paging"
	svc "github.com/connor-davis/3reco/internal/services/collectors"
)

// Handler serves collector routes.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds collector routes under /api.
func (handler *Handler) Register(router fiber.Router) {
	manager := middleware.RequireRole("admin", "staff", "business")
	router.Get("/collectors/stats", manager, handler.stats)
	router.Get("/collectors/selection", manager, handler.selection)
	router.Get("/collectors", manager, handler.list)
	router.Get("/collectors/:id", middleware.RequireUser, handler.find)
	router.Post("/collectors", manager, handler.save)
	router.Patch("/collectors/:id", manager, handler.save)
	router.Delete("/collectors/:id", middleware.RequireRole("admin", "staff"), handler.remove)
}

func (handler *Handler) list(c fiber.Ctx) error { return handler.directory(c, false) }

func (handler *Handler) selection(c fiber.Ctx) error { return handler.directory(c, true) }

func (handler *Handler) directory(c fiber.Ctx, selection bool) error {
	limit := c.Query("limit")
	if selection {
		limit = "200"
	}

	query, err := paging.Parse(c.Query("cursor"), limit, false)
	if err != nil {
		return err
	}

	if selection {
		query.Limit = 200
	}

	user, _ := middleware.CurrentUser(c)
	items, err := handler.svc.List(c.Context(), user, query, selection)
	if err != nil {
		return err
	}

	return c.JSON(items)
}
