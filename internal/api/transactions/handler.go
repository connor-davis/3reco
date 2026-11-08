// Package transactions holds the HTTP handlers for finished trades: the lists
// each role may see, one transaction, and the two ways to record a sale.
package transactions

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/files"
	"github.com/connor-davis/3reco/internal/services/invoices"
	svc "github.com/connor-davis/3reco/internal/services/transactions"
)

// Handler serves /api/transactions.
type Handler struct {
	svc      *svc.Service
	files    *files.Service
	invoices *invoices.Service
}

// New builds the handler.
func New(s *svc.Service, files *files.Service, invoices *invoices.Service) *Handler {
	return &Handler{svc: s, files: files, invoices: invoices}
}

// Register adds the routes to the /api router. Every one needs a signed-in
// user; the service decides which rows that user may see.
func (h *Handler) Register(api fiber.Router) {
	r := api.Group("/transactions", middleware.RequireUser)

	// Fixed paths first, so "purchases" is never read as an id.
	r.Get("/", h.list(svc.KindMine))
	r.Get("/purchases", h.list(svc.KindPurchases))
	r.Get("/sales", h.list(svc.KindSales))
	r.Get("/totals", h.totals)
	r.Post("/collections", h.collection)
	r.Post("/sales", h.sale)

	r.Get("/:id", h.get)
	r.Get("/:id/invoice", h.invoice)
	r.Post("/:id/receipts", h.receiptAttach)
	r.Get("/:id/receipts/:receipt_id", h.receiptDownload)
	r.Delete("/:id/receipts/:receipt_id", h.receiptRemove)
}

func caller(c fiber.Ctx) auth.User {
	user, _ := middleware.CurrentUser(c)

	return user
}

func bind(c fiber.Ctx, into any) error {
	if err := c.Bind().JSON(into); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	return nil
}

// allLimit is how many rows ?all=true returns: the old app's "everything"
// lists, with a ceiling so one call cannot read a whole table.
const allLimit = 1000

func (h *Handler) list(kind string) fiber.Handler {
	return func(c fiber.Ctx) error {
		cursor, limit := c.Query("cursor"), paging.Limit(c.Query("limit"))
		if c.Query("all") == "true" {
			cursor, limit = "", allLimit
		}

		page, err := h.svc.List(c.Context(), caller(c), kind, cursor, limit, filterOf(c))
		if err != nil {
			return err
		}

		return c.JSON(page)
	}
}

func filterOf(c fiber.Ctx) svc.ListFilter {
	return svc.ListFilter{
		Status: c.Query("status"), Q: c.Query("q"), Type: c.Query("type"),
		From: c.Query("from"), To: c.Query("to"), Order: c.Query("order"),
	}
}

// totals sums the whole filtered list of one kind (mine, purchases, sales).
func (h *Handler) totals(c fiber.Ctx) error {
	kind := c.Query("kind", svc.KindMine)
	if kind != svc.KindMine && kind != svc.KindPurchases && kind != svc.KindSales {
		return apperr.BadRequest("Use mine, purchases or sales for kind.", nil)
	}

	out, err := h.svc.Totals(c.Context(), caller(c), kind, filterOf(c))
	if err != nil {
		return err
	}

	return c.JSON(out)
}

func (h *Handler) get(c fiber.Ctx) error {
	t, err := h.svc.Detail(c.Context(), caller(c), c.Params("id"))
	if err != nil {
		return err
	}

	return c.JSON(t)
}

func (h *Handler) collection(c fiber.Ctx) error {
	var in svc.CollectionInput

	if err := bind(c, &in); err != nil {
		return err
	}

	id, err := h.svc.CollectorSale(c.Context(), caller(c), in)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"transaction_id": id})
}

func (h *Handler) sale(c fiber.Ctx) error {
	var in struct {
		BusinessID string         `json:"business_id"`
		Items      []svc.SaleItem `json:"items"`
	}

	if err := bind(c, &in); err != nil {
		return err
	}

	id, err := h.svc.DirectSale(c.Context(), caller(c), in.BusinessID, in.Items)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"transaction_id": id})
}
