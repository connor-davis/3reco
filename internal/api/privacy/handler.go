// Package privacy holds the HTTP handlers for a person's privacy rights: their
// own data export, deleting their account, the privacy notice, and the admin
// audit log. No route takes a user id: each one only acts on the caller.
package privacy

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	svc "github.com/connor-davis/3reco/internal/services/privacy"
)

// Handler serves the /api/privacy routes and the admin audit log.
type Handler struct {
	svc  *svc.Service
	auth *auth.Service
	cfg  config.Config
}

// New builds the handler.
func New(s *svc.Service, a *auth.Service, cfg config.Config) *Handler {
	return &Handler{svc: s, auth: a, cfg: cfg}
}

// Register adds the routes to the /api router. Deleting asks for the password,
// so it sits behind the same rate limit as sign-in.
func (h *Handler) Register(api fiber.Router) {
	limited := middleware.RateLimit(h.auth, "privacy-delete", h.cfg.AuthRateLimit)

	api.Get("/privacy/export", middleware.RequireUser, h.export)
	api.Post("/privacy/delete", middleware.RequireUser, limited, h.remove)
	api.Get("/privacy/notice", middleware.RequireUser, h.notice)
	api.Get("/privacy/notice/current", h.currentNotice)
	api.Post("/privacy/notice/accept", middleware.RequireUser, h.accept)
	api.Get("/admin/privacy-events", middleware.RequireRole(auth.RoleAdmin), h.events)
	api.Get("/admin/activity", middleware.RequireRole(auth.RoleAdmin), h.activity)
}

func caller(c fiber.Ctx) auth.User {
	user, _ := middleware.CurrentUser(c)

	return user
}

func (h *Handler) export(c fiber.Ctx) error {
	data, err := h.svc.Export(c.Context(), caller(c))
	if err != nil {
		return err
	}

	c.Set("Content-Disposition", `attachment; filename="3reco-my-data.json"`)
	c.Set("Cache-Control", "no-store")

	return c.JSON(data)
}

func (h *Handler) remove(c fiber.Ctx) error {
	var in struct {
		Password string `json:"password"`
	}

	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	if err := h.svc.Delete(c.Context(), caller(c), in.Password); err != nil {
		return err
	}

	// The account is gone; this browser forgets it. Other accounts signed in
	// here have to sign in again.
	middleware.SetDevices(c, h.cfg, "", nil)

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) notice(c fiber.Ctx) error {
	notice, err := h.svc.Notice(c.Context(), caller(c))
	if err != nil {
		return err
	}

	return c.JSON(notice)
}

func (h *Handler) accept(c fiber.Ctx) error {
	if err := h.svc.Accept(c.Context(), caller(c)); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) events(c fiber.Ctx) error {
	page, err := h.svc.Events(c.Context(), caller(c), c.Query("cursor"), paging.Limit(c.Query("limit")))
	if err != nil {
		return err
	}

	return c.JSON(page)
}

func (h *Handler) activity(c fiber.Ctx) error {
	page, err := h.svc.Activity(c.Context(), caller(c), svc.ActivityQuery{
		Cursor: c.Query("cursor"), Limit: c.Query("limit"),
		Actor: c.Query("actor"), Table: c.Query("table"), Action: c.Query("action"),
		From: c.Query("from"), To: c.Query("to"), Search: c.Query("q"),
	})
	if err != nil {
		return err
	}

	return c.JSON(page)
}

// currentNotice is public: people read the documents before they sign up.
func (h *Handler) currentNotice(c fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"version": config.NoticeVersion,
		"terms":   config.NoticeTerms,
		"privacy": config.NoticePrivacy,
	})
}
