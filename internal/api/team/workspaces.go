package team

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
)

func (h *Handler) myBusinesses(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	items, err := h.svc.MyBusinesses(c.Context(), user)
	if err != nil {
		return err
	}

	return c.JSON(items)
}

func (h *Handler) selectBusiness(c fiber.Ctx) error {
	session, _ := middleware.CurrentSession(c)
	if err := h.svc.SelectBusiness(c.Context(), session, c.Params("id")); err != nil {
		return err
	}

	fresh, err := h.auth.SessionByID(c.Context(), session.ID)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"user": fresh.User})
}
