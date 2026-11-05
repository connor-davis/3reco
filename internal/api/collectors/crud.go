package collectors

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	svc "github.com/connor-davis/3reco/internal/services/collectors"
)

func (handler *Handler) find(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	item, err := handler.svc.Find(c.Context(), user, c.Params("id"))
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
	var in struct {
		ConfirmationValue string `json:"confirmation_value"`
	}

	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.Delete(c.Context(), user, c.Params("id"), in.ConfirmationValue); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
