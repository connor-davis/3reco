// Package market serves marketplace listings and caller-owned carts.
package market

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	svc "github.com/connor-davis/3reco/internal/services/market"
)

// Handler serves marketplace routes.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds marketplace and cart routes under /api.
func (handler *Handler) Register(router fiber.Router) {
	router.Get("/market/listings", handler.listings)
	router.Get("/market/listings/:id", handler.detail)
	router.Get("/stores/:id/listings", handler.sellerListings)
	router.Get("/cart", middleware.RequireUser, handler.cart)
	router.Put("/cart", middleware.RequireUser, handler.saveCart)
	router.Delete("/cart", middleware.RequireUser, handler.clearCart)
}
