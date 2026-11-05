package market

import "github.com/gofiber/fiber/v3"

func (handler *Handler) detail(c fiber.Ctx) error {
	item, err := handler.svc.Detail(c.Context(), c.Params("id"))
	if err != nil {
		return err
	}

	return c.JSON(item)
}
