package requests

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/services/transactions"
)

func (h *Handler) offer(c fiber.Ctx) error {
	var in struct {
		Items []transactions.SaleItem `json:"items"`
	}

	if err := bind(c, &in); err != nil {
		return err
	}

	if err := h.svc.MakeOffer(c.Context(), caller(c), c.Params("id"), in.Items); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) accept(c fiber.Ctx) error {
	var version []int
	if len(c.Body()) > 0 {
		var in struct {
			OfferVersion int `json:"offer_version"`
		}

		if err := bind(c, &in); err != nil {
			return err
		}

		version = append(version, in.OfferVersion)
	}

	id, err := h.svc.Accept(c.Context(), caller(c), c.Params("id"), version...)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"transaction_id": id})
}

// move builds the handler of one plain transition (decline, withdraw, reject
// or cancel).
func (h *Handler) move(action string) fiber.Handler {
	return func(c fiber.Ctx) error {
		if err := h.svc.Move(c.Context(), caller(c), c.Params("id"), action); err != nil {
			return err
		}

		return ok(c)
	}
}
