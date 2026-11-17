package transactions

import "github.com/gofiber/fiber/v3"

func (h *Handler) certificate(c fiber.Ctx) error {
	data, name, err := h.records.Trade(c.Context(), caller(c), c.Params("id"))
	if err != nil {
		return err
	}

	return sendRecord(c, data, name)
}

// period serves GET /api/certificates?from=YYYY-MM-DD&to=YYYY-MM-DD.
func (h *Handler) period(c fiber.Ctx) error {
	data, name, err := h.records.Period(c.Context(), caller(c), c.Query("from"), c.Query("to"))
	if err != nil {
		return err
	}

	return sendRecord(c, data, name)
}

func sendRecord(c fiber.Ctx, data []byte, name string) error {
	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", `attachment; filename="`+name+`"`)
	c.Set("Cache-Control", "private, no-store")

	return c.Send(data)
}
