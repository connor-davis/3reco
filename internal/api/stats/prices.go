package stats

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
)

func (handler *Handler) prices(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	weeks, err := handler.svc.PriceHistory(c.Context(), user, c.Params("id"))
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"weeks": weeks})
}
