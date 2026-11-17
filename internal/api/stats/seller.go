package stats

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
)

func (handler *Handler) seller(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	result, err := handler.svc.Seller(c.Context(), user)
	if err != nil {
		return err
	}

	return c.JSON(result)
}
