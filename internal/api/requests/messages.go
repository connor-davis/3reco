package requests

import "github.com/gofiber/fiber/v3"

func (h *Handler) messages(c fiber.Ctx) error {
	cursor, limit := listArgs(c)

	page, err := h.svc.Messages(c.Context(), caller(c), c.Params("id"), cursor, limit)
	if err != nil {
		return err
	}

	return c.JSON(page)
}

func (h *Handler) send(c fiber.Ctx) error {
	var in struct {
		Content string `json:"content"`
	}

	if err := bind(c, &in); err != nil {
		return err
	}

	sent, err := h.svc.Send(c.Context(), caller(c), c.Params("id"), in.Content)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"id": sent.ID, "created_at": sent.CreatedAt})
}

func (h *Handler) markRead(c fiber.Ctx) error {
	if err := h.svc.MarkRead(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) inbox(c fiber.Ctx) error {
	cursor, limit := listArgs(c)

	page, err := h.svc.Inbox(c.Context(), caller(c), cursor, limit)
	if err != nil {
		return err
	}

	return c.JSON(page)
}
