package market

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	store "github.com/connor-davis/3reco/internal/stores/market"
)

func (handler *Handler) cartStores(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	items, err := handler.svc.CartStores(c.Context(), user.ID)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"items": items})
}

func (handler *Handler) cart(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	item, err := handler.svc.Cart(c.Context(), user.ID, c.Query("seller_id"))
	if err != nil {
		return err
	}

	return c.JSON(item)
}

func (handler *Handler) saveCart(c fiber.Ctx) error {
	var in struct {
		Items []store.CartItem `json:"items"`
	}

	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.SaveCart(c.Context(), user.ID, c.Query("seller_id"), in.Items); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (handler *Handler) clearCart(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.ClearCart(c.Context(), user.ID, c.Query("seller_id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
