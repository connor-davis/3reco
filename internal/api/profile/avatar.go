package profile

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
)

func (handler *Handler) uploadAvatar(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	id := user.ID
	if user.ActiveBusinessID != "" {
		if err := auth.RequireBusiness(user, "owner"); err != nil {
			return err
		}
		id = user.ActiveBusinessID
	}
	file, err := c.FormFile("file")
	if err != nil {
		return apperr.BadRequest("Choose an image in the file field.", nil)
	}

	reader, err := file.Open()
	if err != nil {
		return apperr.BadRequest("Could not read the image.", nil)
	}
	defer reader.Close()

	if err := handler.svc.UploadAvatar(c.Context(), id, reader, user.ActiveBusinessID != ""); err != nil {
		return err
	}

	return handler.find(c)
}

func (handler *Handler) deleteAvatar(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	id := user.ID
	if user.ActiveBusinessID != "" {
		if err := auth.RequireBusiness(user, "owner"); err != nil {
			return err
		}
		id = user.ActiveBusinessID
	}
	if err := handler.svc.DeleteAvatar(c.Context(), id, user.ActiveBusinessID != ""); err != nil {
		return err
	}

	return handler.find(c)
}

func (handler *Handler) avatar(c fiber.Ctx) error {
	return handler.serveAvatar(c, false)
}

func (handler *Handler) logo(c fiber.Ctx) error {
	return handler.serveAvatar(c, true)
}

func (handler *Handler) serveAvatar(c fiber.Ctx, business bool) error {
	reader, kind, err := handler.svc.Avatar(c.Context(), c.Params("id"), business)
	if err != nil {
		return err
	}

	c.Set("Content-Type", kind)
	c.Set("Cache-Control", "public, max-age=300")

	return c.SendStream(reader)
}
