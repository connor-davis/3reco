// Package stores serves public business profiles.
package stores

import (
	"github.com/gofiber/fiber/v3"

	svc "github.com/connor-davis/3reco/internal/services/stores"
)

// Handler serves store routes.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds public store routes under /api.
func (handler *Handler) Register(router fiber.Router) {
	router.Get("/stores", handler.list)
	router.Get("/stores/:id", handler.find)
}
