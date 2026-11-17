package api

import (
	"strings"

	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
)

// demoBlocked lists what the demo site refuses, by path prefix, with the
// plain words the visitor sees.
var demoBlocked = []struct{ prefix, message string }{
	{"/api/exports/", "Downloads are switched off in the demo."},
	{"/api/admin/exports/", "Downloads are switched off in the demo."},
	{"/api/business/export", "Downloads are switched off in the demo."},
	{"/api/privacy/export", "Downloads are switched off in the demo."},
	{"/api/privacy/delete", "You cannot delete a demo account. The demo resets every night."},
	{"/api/auth/sign-up", "Sign-up is switched off in the demo. Use one of the demo sign-ins."},
	{"/api/auth/forgot-password", "Password reset is switched off in the demo."},
}

// demoRoutes adds the public /api/config route that tells the web app whether
// this is the demo. It carries nothing secret, so it works signed out.
func demoRoutes(api fiber.Router, cfg config.Config) {
	api.Get("/config", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"demo": cfg.Demo})
	})
}

// demoGuard refuses the routes in demoBlocked. It is only used in demo mode.
func demoGuard(c fiber.Ctx) error {
	path := c.Path()

	for _, rule := range demoBlocked {
		if strings.HasPrefix(path, rule.prefix) {
			return apperr.Forbidden(rule.message).WithCode("demo_blocked")
		}
	}

	return c.Next()
}

// demoRobots keeps search engines out: a header on every answer, and a
// robots.txt that says no to everything.
func demoRobots(app *fiber.App) {
	app.Use(func(c fiber.Ctx) error {
		c.Set("X-Robots-Tag", "noindex, nofollow")

		return c.Next()
	})

	app.Get("/robots.txt", func(c fiber.Ctx) error {
		c.Type("txt")

		return c.SendString("User-agent: *\nDisallow: /\n")
	})
}

// noIndex adds the robots meta tag to the page the demo serves.
func noIndex(page []byte) []byte {
	tag := `<meta name="robots" content="noindex, nofollow">`

	return []byte(strings.Replace(string(page), "</head>", tag+"</head>", 1))
}
