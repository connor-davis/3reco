package middleware

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
)

// RequireBusiness checks the caller's current membership and minimum team role.
func RequireBusiness(minimum string) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := CurrentUser(c)
		if !ok {
			return apperr.Unauthorized("Please sign in.")
		}

		if err := auth.RequireBusiness(user, minimum); err != nil {
			return err
		}

		return c.Next()
	}
}
