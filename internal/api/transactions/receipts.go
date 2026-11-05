package transactions

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/platform/apperr"
)

func (h *Handler) invoice(c fiber.Ctx) error {
	reader, number, err := h.invoices.Download(c.Context(), caller(c), c.Params("id"))
	if err != nil {
		return err
	}

	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", `attachment; filename="3rEco-Invoice-`+number+`.pdf"`)
	c.Set("Cache-Control", "private, no-store")

	return c.SendStream(reader)
}

func (h *Handler) receiptDownload(c fiber.Ctx) error {
	reader, receipt, err := h.files.Download(
		c.Context(), caller(c), c.Params("id"), c.Params("receipt_id"))
	if err != nil {
		return err
	}

	c.Set("Content-Type", receipt.ContentType)
	c.Set("Content-Disposition", `attachment; filename="`+receipt.FileName+`"`)
	c.Set("Cache-Control", "private, no-store")

	return c.SendStream(reader)
}

func (h *Handler) receiptAttach(c fiber.Ctx) error {
	if _, err := h.svc.Participant(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	file, err := c.FormFile("file")
	if err != nil {
		return apperr.BadRequest("Choose an image in the file field.", nil)
	}

	reader, err := file.Open()
	if err != nil {
		return apperr.BadRequest("Could not read the image.", nil)
	}
	defer reader.Close()

	receipt, err := h.files.Attach(c.Context(), caller(c), c.Params("id"), file.Filename, reader)
	if err != nil {
		return err
	}

	return c.JSON(receipt)
}
