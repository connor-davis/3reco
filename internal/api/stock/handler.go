// Package stock serves owner-scoped stock routes.
package stock

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/paging"
	svc "github.com/connor-davis/3reco/internal/services/stock"
)

// Handler serves stock requests.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds stock routes under /api.
func (handler *Handler) Register(router fiber.Router) {
	router.Get("/stock/:id", handler.find)
	router.Get("/stock", middleware.RequireUser, handler.list)
	router.Post("/stock", middleware.RequireUser, handler.create)
	router.Patch("/stock/:id", middleware.RequireUser, handler.update)
	router.Delete("/stock/:id", middleware.RequireUser, handler.remove)
}

func (handler *Handler) find(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	item, err := handler.svc.Find(c.Context(), c.Params("id"), user.ID)
	if err != nil {
		return err
	}

	return c.JSON(item)
}

func (handler *Handler) list(c fiber.Ctx) error {
	query, err := paging.Parse(c.Query("cursor"), c.Query("limit"), c.Query("all") == "true")
	if err != nil {
		return err
	}

	query.Like = paging.SearchPattern(c.Query("q"))

	user, _ := middleware.CurrentUser(c)
	items, err := handler.svc.List(c.Context(), user.ID, query, c.Query("status"))
	if err != nil {
		return err
	}

	return c.JSON(items)
}
