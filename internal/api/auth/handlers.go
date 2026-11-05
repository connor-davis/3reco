// Package auth holds the HTTP handlers for sign-up, sign-in, email checks,
// password reset and the signed-in accounts of one browser.
package auth

import (
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	svc "github.com/connor-davis/3reco/internal/services/auth"
)

// Handler serves the /api/auth routes.
type Handler struct {
	svc *svc.Service
	cfg config.Config
}

// New builds the handler.
func New(s *svc.Service, cfg config.Config) *Handler { return &Handler{svc: s, cfg: cfg} }

// Register adds the routes. Routes that take a password or send an email sit
// behind the rate limit; the rest only need a session.
func (h *Handler) Register(r fiber.Router) {
	limited := func(name string) fiber.Handler {
		return middleware.RateLimit(h.svc, name, h.cfg.AuthRateLimit)
	}

	r.Post("/sign-up", limited("sign-up"), h.signUp)
	r.Post("/sign-in", limited("sign-in"), h.signIn)
	r.Post("/sign-out", h.signOut)
	r.Get("/me", middleware.RequireUser, h.me)
	r.Post("/verify-email/send", limited("verify-send"), h.sendVerification)
	r.Post("/verify-email", limited("verify"), h.verifyEmail)
	r.Post("/forgot-password", limited("forgot"), h.forgotPassword)
	r.Post("/reset-password", limited("reset"), h.resetPassword)

	r.Get("/sessions", middleware.RequireUser, h.sessions)
	r.Post("/sessions/revoke-others", middleware.RequireUser, h.revokeOthers)
	r.Post("/sessions/sign-out-all", h.signOutAll)
	r.Post("/sessions/:id/switch", middleware.RequireUser, h.switchSession)
	r.Delete("/sessions/:id", middleware.RequireUser, h.revoke)
}

type credentials struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Token    string `json:"token"`
}

func body(c fiber.Ctx) (credentials, error) {
	var in credentials

	if err := c.Bind().JSON(&in); err != nil {
		return in, apperr.BadRequest("Send a JSON body.", nil)
	}

	return in, nil
}

func ok(c fiber.Ctx) error { return c.JSON(fiber.Map{"ok": true}) }

func (h *Handler) signUp(c fiber.Ctx) error {
	in, err := body(c)
	if err != nil {
		return err
	}

	if err := h.svc.SignUp(c.Context(), in.Name, in.Email, in.Password); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) signIn(c fiber.Ctx) error {
	in, err := body(c)
	if err != nil {
		return err
	}

	token, user, err := h.svc.SignIn(c.Context(), in.Email, in.Password, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	middleware.SetSession(c, h.cfg, token)

	return c.JSON(fiber.Map{"user": user})
}

func (h *Handler) me(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	return c.JSON(fiber.Map{"user": user})
}

// signOut ends the active session and, when this browser holds another one,
// switches to it.
func (h *Handler) signOut(c fiber.Ctx) error {
	if sess, found := middleware.CurrentSession(c); found {
		tokens := middleware.DeviceTokens(c)

		if err := h.svc.Revoke(c.Context(), tokens, sess.ID); err != nil {
			return err
		}

		return h.afterRevoke(c, tokens)
	}

	middleware.SetDevices(c, h.cfg, "", middleware.DeviceTokens(c))

	return ok(c)
}

// afterRevoke keeps only the tokens that still have a live session and makes
// the first one active.
func (h *Handler) afterRevoke(c fiber.Ctx, tokens []string) error {
	live, err := h.svc.Devices(c.Context(), tokens)
	if err != nil {
		return err
	}

	var keep []string

	for _, sess := range live {
		token, found, err := h.svc.DeviceToken(c.Context(), tokens, sess.ID)
		if err != nil {
			return err
		}

		if found {
			keep = append(keep, token)
		}
	}

	active := ""
	if len(keep) > 0 {
		active = keep[0]
	}

	middleware.SetDevices(c, h.cfg, active, keep)

	return ok(c)
}

func (h *Handler) sendVerification(c fiber.Ctx) error {
	in, err := body(c)
	if err != nil {
		return err
	}

	if err := h.svc.RequestVerification(c.Context(), in.Email); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) verifyEmail(c fiber.Ctx) error {
	in, err := body(c)
	if err != nil {
		return err
	}

	if err := h.svc.ConfirmVerification(c.Context(), in.Token); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) forgotPassword(c fiber.Ctx) error {
	in, err := body(c)
	if err != nil {
		return err
	}

	if err := h.svc.RequestReset(c.Context(), in.Email); err != nil {
		return err
	}

	return ok(c)
}

func (h *Handler) resetPassword(c fiber.Ctx) error {
	in, err := body(c)
	if err != nil {
		return err
	}

	if err := h.svc.ConfirmReset(c.Context(), in.Token, in.Password); err != nil {
		return err
	}

	return ok(c)
}

type device struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Name      string    `json:"name"`
	Email     *string   `json:"email"`
	Role      *string   `json:"role"`
	Current   bool      `json:"current"`
	CreatedAt time.Time `json:"createdAt"`
}

// sessions lists the accounts signed in on this browser, and no one else's.
func (h *Handler) sessions(c fiber.Ctx) error {
	current, _ := middleware.CurrentSession(c)

	list, err := h.svc.Devices(c.Context(), middleware.DeviceTokens(c))
	if err != nil {
		return err
	}

	out := make([]device, 0, len(list))

	for _, sess := range list {
		out = append(out, device{
			ID: sess.ID, UserID: sess.User.ID, Name: sess.User.Name, Email: sess.User.Email,
			Role: sess.User.Role, Current: sess.ID == current.ID, CreatedAt: sess.CreatedAt,
		})
	}

	return c.JSON(fiber.Map{"sessions": out})
}

func (h *Handler) switchSession(c fiber.Ctx) error {
	tokens := middleware.DeviceTokens(c)

	token, found, err := h.svc.DeviceToken(c.Context(), tokens, c.Params("id"))
	if err != nil {
		return err
	}

	if !found {
		return apperr.NotFound("No such session.")
	}

	middleware.SetSession(c, h.cfg, token)

	return ok(c)
}

func (h *Handler) revoke(c fiber.Ctx) error {
	tokens := middleware.DeviceTokens(c)

	_, found, err := h.svc.DeviceToken(c.Context(), tokens, c.Params("id"))
	if err != nil {
		return err
	}

	if !found {
		return apperr.NotFound("No such session.")
	}

	if err := h.svc.Revoke(c.Context(), tokens, c.Params("id")); err != nil {
		return err
	}

	return h.afterRevoke(c, tokens)
}

func (h *Handler) revokeOthers(c fiber.Ctx) error {
	current, _ := middleware.CurrentSession(c)
	tokens := middleware.DeviceTokens(c)

	list, err := h.svc.Devices(c.Context(), tokens)
	if err != nil {
		return err
	}

	var ids []string

	for _, sess := range list {
		if sess.ID != current.ID {
			ids = append(ids, sess.ID)
		}
	}

	if err := h.svc.Revoke(c.Context(), tokens, ids...); err != nil {
		return err
	}

	return h.afterRevoke(c, tokens)
}

func (h *Handler) signOutAll(c fiber.Ctx) error {
	tokens := middleware.DeviceTokens(c)

	list, err := h.svc.Devices(c.Context(), tokens)
	if err != nil {
		return err
	}

	ids := make([]string, 0, len(list))
	for _, sess := range list {
		ids = append(ids, sess.ID)
	}

	if err := h.svc.Revoke(c.Context(), tokens, ids...); err != nil {
		return err
	}

	middleware.SetDevices(c, h.cfg, "", nil)

	return ok(c)
}
