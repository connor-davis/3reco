package transactions

import (
	"net/http"

	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/platform/apperr"
)

// notYet is the answer of the invoice and receipt routes until T10 builds the
// PDF and file work. The access check runs first, so the route already
// refuses strangers the way the finished one will.
var notYet = &apperr.Error{
	Status:  http.StatusNotImplemented,
	Code:    "not_implemented",
	Message: "This is not available yet.",
}

// invoice is open to staff and both sides of the trade.
func (h *Handler) invoice(c fiber.Ctx) error {
	if _, err := h.svc.Detail(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	return notYet
}

// receiptDownload is open to staff and both sides of the trade.
func (h *Handler) receiptDownload(c fiber.Ctx) error {
	if _, err := h.svc.Detail(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	return notYet
}

// receiptUpload is open to the two sides of the trade only; staff read
// receipts but never add them.
func (h *Handler) receiptUpload(c fiber.Ctx) error {
	if _, err := h.svc.Participant(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	return notYet
}

// receiptAttach is open to the two sides of the trade only.
func (h *Handler) receiptAttach(c fiber.Ctx) error {
	if _, err := h.svc.Participant(c.Context(), caller(c), c.Params("id")); err != nil {
		return err
	}

	return notYet
}
