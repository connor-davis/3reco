package requests

import (
	"github.com/gofiber/fiber/v3"

	svc "github.com/connor-davis/3reco/internal/services/requests"
)

func (h *Handler) create(c fiber.Ctx) error {
	var in svc.CreateInput

	if err := bind(c, &in); err != nil {
		return err
	}

	id, err := h.svc.Create(c.Context(), caller(c), in)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"id": id})
}

func (h *Handler) get(c fiber.Ctx) error {
	r, err := h.svc.Get(c.Context(), caller(c), c.Params("id"))
	if err != nil {
		return err
	}

	return c.JSON(r)
}

func (h *Handler) incoming(c fiber.Ctx) error {
	cursor, limit := listArgs(c)

	page, err := h.svc.Incoming(c.Context(), caller(c), cursor, limit)
	if err != nil {
		return err
	}

	return c.JSON(page)
}

func (h *Handler) outgoing(c fiber.Ctx) error {
	cursor, limit := listArgs(c)

	page, err := h.svc.Outgoing(c.Context(), caller(c), cursor, limit)
	if err != nil {
		return err
	}

	return c.JSON(page)
}
