package stock

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	svc "github.com/connor-davis/3reco/internal/services/stock"
)

func (handler *Handler) create(c fiber.Ctx) error {
	var in svc.Input
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	id, err := handler.svc.Create(c.Context(), user.ID, in)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"id": id})
}

func (handler *Handler) update(c fiber.Ctx) error {
	var in svc.Input
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.Update(c.Context(), c.Params("id"), user.ID, in); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (handler *Handler) remove(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.Delete(c.Context(), c.Params("id"), user.ID); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
