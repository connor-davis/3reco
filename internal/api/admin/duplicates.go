package admin

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/platform/apperr"
)

func (h *Handler) duplicates(c fiber.Ctx) error {
	review, err := h.svc.Duplicates(c.Context(), caller(c))
	if err != nil {
		return err
	}

	return c.JSON(review)
}

func (h *Handler) markDuplicate(c fiber.Ctx) error {
	var in struct {
		OriginalID string `json:"original_id"`
	}
	if err := c.Bind().JSON(&in); err != nil || in.OriginalID == "" {
		return apperr.BadRequest("Choose the original trade.", nil)
	}

	if err := h.svc.MarkDuplicate(c.Context(), caller(c), c.Params("id"), in.OriginalID); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) undoDuplicate(c fiber.Ctx) error {
	if err := h.svc.UndoDuplicate(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) dismissDuplicates(c fiber.Ctx) error {
	var in struct {
		IDs []string `json:"ids"`
	}
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Choose a duplicate group.", nil)
	}

	if err := h.svc.DismissDuplicates(c.Context(), caller(c), in.IDs); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
