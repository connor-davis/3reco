package materials

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	svc "github.com/connor-davis/3reco/internal/services/materials"
)

func (handler *Handler) list(c fiber.Ctx) error {
	query, err := paging.Parse(c.Query("cursor"), c.Query("limit"), c.Query("all") == "true")
	if err != nil {
		return err
	}

	items, err := handler.svc.List(c.Context(), query)
	if err != nil {
		return err
	}

	return c.JSON(items)
}

func (handler *Handler) find(c fiber.Ctx) error {
	item, err := handler.svc.Find(c.Context(), c.Params("id"))
	if err != nil {
		return err
	}

	return c.JSON(item)
}

func (handler *Handler) save(c fiber.Ctx) error {
	var in svc.Input
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	id, err := handler.svc.Save(c.Context(), user, c.Params("id"), in)
	if err != nil {
		return err
	}

	if c.Method() == "POST" {
		return c.JSON(fiber.Map{"id": id})
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (handler *Handler) remove(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.Delete(c.Context(), user, c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
