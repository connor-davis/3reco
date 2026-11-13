// Package team exposes the owner-only Team routes and public invitation flow.
package team

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/services/auth"
	svc "github.com/connor-davis/3reco/internal/services/team"
)

// Handler serves Team management and invitation acceptance.
type Handler struct {
	svc  *svc.Service
	auth *auth.Service
	cfg  config.Config
}

// New builds the Team handlers.
func New(s *svc.Service, a *auth.Service, cfg config.Config) *Handler {
	return &Handler{svc: s, auth: a, cfg: cfg}
}

// Register installs owner routes and guest-accessible, rate-limited auth routes.
func (h *Handler) Register(api fiber.Router) {
	team := api.Group("/team", middleware.RequireBusiness("owner"))
	team.Get("/", h.list)
	team.Post("/invites", h.invite)
	team.Post("/invites/:id/resend", h.resend)
	team.Delete("/invites/:id", h.revoke)
	team.Patch("/members/:userId", h.role)
	team.Delete("/members/:userId", h.remove)

	api.Get("/auth/invites/:token",
		middleware.RateLimit(h.auth, "invite-preview", h.cfg.AuthRateLimit), h.preview)
	api.Post("/auth/invites/accept",
		middleware.RateLimit(h.auth, "invite-accept", h.cfg.AuthRateLimit), h.accept)
}

func (h *Handler) list(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	result, err := h.svc.List(c.Context(), user)
	if err != nil {
		return err
	}

	return c.JSON(result)
}

type invitation struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

func (h *Handler) invite(c fiber.Ctx) error {
	var in invitation
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Invite(c.Context(), user, in.Email, in.Role); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) resend(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Resend(c.Context(), user, c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) revoke(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Revoke(c.Context(), user, c.Params("id")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) role(c fiber.Ctx) error {
	var in invitation
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := h.svc.ChangeRole(c.Context(), user, c.Params("userId"), in.Role); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) remove(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Remove(c.Context(), user, c.Params("userId")); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) preview(c fiber.Ctx) error {
	result, err := h.svc.Preview(c.Context(), c.Params("token"))
	if err != nil {
		return err
	}

	return c.JSON(result)
}

func (h *Handler) accept(c fiber.Ctx) error {
	var in svc.Acceptance
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send a JSON body.", nil)
	}

	var session *auth.Session
	if current, ok := middleware.CurrentSession(c); ok {
		session = &current
	}
	if err := h.svc.Accept(c.Context(), session, in); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
