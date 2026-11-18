package stores

import (
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

func (handler *Handler) list(c fiber.Ctx) error {
	query, err := paging.Parse(c.Query("cursor"), c.Query("limit"), false)
	if err != nil {
		return err
	}

	user, _ := middleware.CurrentUser(c)
	items, err := handler.svc.List(c.Context(), user, c.Query("q"), query, c.Query("all") == "true")
	if err != nil {
		return err
	}

	return c.JSON(items)
}

func (handler *Handler) find(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	item, err := handler.svc.Find(c.Context(), c.Params("id"), auth.PartyID(user))
	if err != nil {
		return err
	}

	return c.JSON(item)
}
