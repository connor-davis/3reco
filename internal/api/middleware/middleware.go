// Package middleware holds the Fiber steps every route can share: who is
// calling, role checks, CSRF and the auth rate limit.
package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/services/auth"
)

// Cookie names. The first holds the active session token. The second holds
// every token this browser has signed in with, so one browser can switch
// between accounts.
const (
	SessionCookie = "threereco_session"
	DevicesCookie = "threereco_devices"
	cookieMaxAge  = 30 * 24 * 60 * 60
	maxDevices    = 10
)

type localKey string

const sessionKey localKey = "session"

// Authenticate loads the caller from the session cookie, once per request.
// It never rejects: a request with no good session simply has no user, and
// RequireUser decides whether that matters.
func Authenticate(svc *auth.Service, cfg config.Config) fiber.Handler {
	return func(c fiber.Ctx) error {
		token := c.Cookies(SessionCookie)
		if token == "" {
			return c.Next()
		}

		sess, refreshed, err := svc.Authenticate(c.Context(), token)
		if err != nil {
			if _, bad := err.(*apperr.Error); bad {
				return c.Next()
			}

			return err
		}

		c.Locals(sessionKey, sess)

		if refreshed {
			SetSession(c, cfg, token)
		}

		return c.Next()
	}
}

// CurrentSession returns the caller's session, or false when not signed in.
func CurrentSession(c fiber.Ctx) (auth.Session, bool) {
	sess, ok := c.Locals(sessionKey).(auth.Session)

	return sess, ok
}

// CurrentUser returns the signed-in user, or false.
func CurrentUser(c fiber.Ctx) (auth.User, bool) {
	sess, ok := CurrentSession(c)

	return sess.User, ok
}

// RequireUser answers 401 when nobody is signed in.
func RequireUser(c fiber.Ctx) error {
	if _, ok := CurrentSession(c); !ok {
		return apperr.Unauthorized("Please sign in.")
	}

	return c.Next()
}

// RequireRole answers 401 when nobody is signed in and 403 when the user's
// role is not one of roles.
func RequireRole(roles ...string) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := CurrentUser(c)
		if !ok {
			return apperr.Unauthorized("Please sign in.")
		}

		if !auth.HasRole(user, roles...) {
			return apperr.Forbidden("You are not allowed to do that.")
		}

		return c.Next()
	}
}

// DeviceTokens lists the session tokens this browser holds.
func DeviceTokens(c fiber.Ctx) []string {
	raw := c.Cookies(DevicesCookie)
	if raw == "" {
		return nil
	}

	var out []string

	for _, token := range strings.Split(raw, ",") {
		if token != "" && len(out) < maxDevices {
			out = append(out, token)
		}
	}

	return out
}

// SetSession makes token the active session of this browser and remembers it
// in the device list.
func SetSession(c fiber.Ctx, cfg config.Config, token string) {
	setCookie(c, cfg, SessionCookie, token)

	tokens := []string{token}

	for _, other := range DeviceTokens(c) {
		if other != token && len(tokens) < maxDevices {
			tokens = append(tokens, other)
		}
	}

	setCookie(c, cfg, DevicesCookie, strings.Join(tokens, ","))
}

// SetDevices stores the device list and the active token (empty clears it).
func SetDevices(c fiber.Ctx, cfg config.Config, active string, tokens []string) {
	setCookie(c, cfg, SessionCookie, active)
	setCookie(c, cfg, DevicesCookie, strings.Join(tokens, ","))
}

func setCookie(c fiber.Ctx, cfg config.Config, name, value string) {
	maxAge := cookieMaxAge
	if value == "" {
		maxAge = -1
	}

	c.Cookie(&fiber.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HTTPOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: fiber.CookieSameSiteLaxMode,
	})
}

// TrustedOrigin is true when the browser's Origin is the web app's origin, or
// the API's own address (the Go binary serves the built app itself, so a page
// on :8180 is same-site even when THREERECO_WEB_ORIGIN names the Vite server).
// A browser never lets a page forge its Origin.
func TrustedOrigin(c fiber.Ctx, cfg config.Config) bool {
	origin := c.Get("Origin")

	return origin != "" && (origin == cfg.WebOrigin || origin == c.Scheme()+"://"+c.Host())
}

// CSRF refuses a browser request that changes data from another site. A
// browser always sends Origin or Sec-Fetch-Site on those; a request with
// neither is a script or curl, which has no cookie to ride on. SameSite=Lax
// on the cookies is the second lock.
func CSRF(cfg config.Config) fiber.Handler {
	return func(c fiber.Ctx) error {
		switch c.Method() {
		case fiber.MethodGet, fiber.MethodHead, fiber.MethodOptions:
			return c.Next()
		}

		if c.Get("Origin") != "" {
			if !TrustedOrigin(c, cfg) {
				return apperr.Forbidden("This request came from another site.")
			}

			return c.Next()
		}

		switch c.Get("Sec-Fetch-Site") {
		case "", "same-origin", "none":
			return c.Next()
		}

		return apperr.Forbidden("This request came from another site.")
	}
}

// RateLimit counts requests per address on one route and answers 429 past the
// limit. The count lives in Postgres, so it holds across several servers.
func RateLimit(svc *auth.Service, name string, limit int) fiber.Handler {
	return func(c fiber.Ctx) error {
		ok, err := svc.Allow(c.Context(), name+":"+c.IP(), limit)
		if err != nil {
			return err
		}

		if !ok {
			c.Set("Retry-After", "60")

			return apperr.TooMany("Too many tries. Wait a minute and try again.")
		}

		return c.Next()
	}
}

// guestPaths are the only /api paths a guest may use before setup is done:
// sign-out and sessions, their own profile and setup, the privacy notice and
// their own data rights.
var guestPaths = []string{
	"/api/health", "/api/auth/", "/api/profile",
	"/api/privacy/notice", "/api/privacy/export", "/api/privacy/delete",
}

// RequireSetup keeps a signed-in guest (no role yet) inside guestPaths. Anyone
// else, and anyone not signed in, passes untouched.
func RequireSetup(c fiber.Ctx) error {
	user, ok := CurrentUser(c)
	if !ok || (user.Role != nil && *user.Role != auth.RoleGuest) {
		return c.Next()
	}

	path := c.Path()
	for _, allowed := range guestPaths {
		if strings.HasPrefix(path, allowed) {
			return c.Next()
		}
	}

	// A guest still sees their own avatar in the page header.
	if c.Method() == fiber.MethodGet && path == "/api/users/"+user.ID+"/avatar" {
		return c.Next()
	}

	return &apperr.Error{
		Status:  fiber.StatusForbidden,
		Code:    "setup_required",
		Message: "Finish your setup first.",
	}
}
