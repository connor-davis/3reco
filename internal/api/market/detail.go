package market

import (
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
)

func (handler *Handler) detail(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	item, err := handler.svc.Detail(c.Context(), c.Params("id"), auth.PartyID(user))
	if err != nil {
		return err
	}

	return c.JSON(item)
}
