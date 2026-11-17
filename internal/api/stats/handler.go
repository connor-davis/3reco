// Package stats serves public marketplace totals.
package stats

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	svc "github.com/connor-davis/3reco/internal/services/stats"
)

// Handler serves community statistics.
type Handler struct{ svc *svc.Service }

// New builds the stats handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds public totals and the authenticated price-history route under /api.
func (handler *Handler) Register(router fiber.Router) {
	router.Get("/stats", handler.stats)
	router.Get("/stats/seller", middleware.RequireUser, handler.seller)
	router.Get("/materials/:id/price-history", middleware.RequireUser, handler.prices)
}

func (handler *Handler) stats(c fiber.Ctx) error {
	result, err := handler.svc.Summary(c.Context())
	if err != nil {
		return err
	}

	return c.JSON(result)
}
