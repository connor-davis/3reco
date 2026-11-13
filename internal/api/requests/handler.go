// Package requests holds the HTTP handlers for buying requests, their offers,
// the chat on them and the messages inbox.
package requests

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	svc "github.com/connor-davis/3reco/internal/services/requests"
)

// Handler serves /api/requests and /api/messages/inbox.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(s *svc.Service) *Handler { return &Handler{svc: s} }

// Register adds the routes to the /api router. Every one needs a signed-in
// user; who may see which request is decided in the service.
func (h *Handler) Register(api fiber.Router) {
	requests := api.Group("/requests", middleware.RequireUser)

	// The fixed paths come before /:id, or "incoming" would be read as an id.
	requests.Get("/incoming", h.incoming)
	requests.Get("/outgoing", h.outgoing)
	requests.Post("/", middleware.RequireBusiness("manager"), h.create)
	requests.Get("/:id", h.get)

	requests.Post("/:id/offer", middleware.RequireBusiness("manager"), h.offer)
	requests.Post("/:id/accept", middleware.RequireBusiness("manager"), h.accept)
	requests.Post("/:id/decline", middleware.RequireBusiness("manager"), h.move("decline"))
	requests.Post("/:id/withdraw", middleware.RequireBusiness("manager"), h.move("withdraw"))
	requests.Post("/:id/reject", middleware.RequireBusiness("manager"), h.move("reject"))
	requests.Post("/:id/cancel", middleware.RequireBusiness("manager"), h.move("cancel"))

	requests.Get("/:id/messages", h.messages)
	requests.Post("/:id/messages", h.send)
	requests.Post("/:id/messages/read", h.markRead)

	api.Get("/messages/inbox", middleware.RequireUser, h.inbox)
	api.Get("/messages/all", middleware.RequireUser, h.allThreads)
}

func caller(c fiber.Ctx) auth.User {
	user, _ := middleware.CurrentUser(c)

	return user
}

func ok(c fiber.Ctx) error { return c.JSON(fiber.Map{"ok": true}) }

func bind(c fiber.Ctx, into any) error {
	if err := c.Bind().JSON(into); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	return nil
}

func listArgs(c fiber.Ctx) (cursor string, limit int) {
	return c.Query("cursor"), paging.Limit(c.Query("limit"))
}
