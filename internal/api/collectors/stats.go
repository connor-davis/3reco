package collectors

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
)

func (handler *Handler) stats(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	item, err := handler.svc.Stats(c.Context(), user, c.Query("phone"))
	if err != nil {
		return err
	}

	return c.JSON(item)
}
