// Package wanted serves /api/wanted: buyers post what they want, verified
// sellers browse and reply.
package wanted

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/transactions"
	svc "github.com/connor-davis/3reco/internal/services/wanted"
)

// Handler serves the wanted post routes.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(s *svc.Service) *Handler { return &Handler{svc: s} }

// Register adds the routes to the /api router. Posting and replying are for
// business managers; the service also limits browsing and replying to
// verified businesses and ownership of a post.
func (h *Handler) Register(api fiber.Router) {
	wanted := api.Group("/wanted", middleware.RequireUser, middleware.RequireBusiness("manager"))

	// The fixed path comes before /:id, or "mine" would be read as an id.
	wanted.Get("/mine", h.mine)
	wanted.Get("/", h.discover)
	wanted.Post("/", h.create)
	wanted.Get("/:id/replies", h.replies)
	wanted.Post("/:id/replies", h.reply)
	wanted.Post("/:id/close", h.close)
}

func caller(c fiber.Ctx) auth.User {
	user, _ := middleware.CurrentUser(c)

	return user
}

func (h *Handler) create(c fiber.Ctx) error {
	var in svc.CreateInput

	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	id, err := h.svc.Create(c.Context(), caller(c), in)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"id": id})
}

func (h *Handler) mine(c fiber.Ctx) error {
	page, err := h.svc.Mine(c.Context(), caller(c), c.Query("cursor"), paging.Limit(c.Query("limit")))
	if err != nil {
		return err
	}

	return c.JSON(page)
}

func (h *Handler) discover(c fiber.Ctx) error {
	page, err := h.svc.Discover(
		c.Context(),
		caller(c),
		c.Query("material_id"),
		c.Query("cursor"),
		paging.Limit(c.Query("limit")),
	)
	if err != nil {
		return err
	}

	return c.JSON(page)
}

func (h *Handler) replies(c fiber.Ctx) error {
	items, err := h.svc.Replies(c.Context(), caller(c), c.Params("id"))
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"items": items})
}

func (h *Handler) reply(c fiber.Ctx) error {
	var in struct {
		Items []transactions.SaleItem `json:"items"`
	}

	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	id, err := h.svc.Reply(c.Context(), caller(c), c.Params("id"), in.Items)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"id": id})
}

func (h *Handler) close(c fiber.Ctx) error {
	if err := h.svc.Close(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
