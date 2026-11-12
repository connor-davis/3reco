package stores

import (
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
	items, err := handler.svc.List(c.Context(), c.Query("q"), user.ID, query)
	if err != nil {
		return err
	}

	return c.JSON(items)
}

func (handler *Handler) find(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	item, err := handler.svc.Find(c.Context(), c.Params("id"), user.ID)
	if err != nil {
		return err
	}

	return c.JSON(item)
}
