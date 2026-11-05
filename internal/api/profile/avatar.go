package profile

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
)

func (handler *Handler) uploadAvatar(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	file, err := c.FormFile("file")
	if err != nil {
		return apperr.BadRequest("Choose an image in the file field.", nil)
	}

	reader, err := file.Open()
	if err != nil {
		return apperr.BadRequest("Could not read the image.", nil)
	}
	defer reader.Close()

	if err := handler.svc.UploadAvatar(c.Context(), user.ID, reader); err != nil {
		return err
	}

	return handler.find(c)
}

func (handler *Handler) deleteAvatar(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.DeleteAvatar(c.Context(), user.ID); err != nil {
		return err
	}

	return handler.find(c)
}

func (handler *Handler) avatar(c fiber.Ctx) error {
	reader, kind, err := handler.svc.Avatar(c.Context(), c.Params("id"))
	if err != nil {
		return err
	}

	c.Set("Content-Type", kind)
	c.Set("Cache-Control", "public, max-age=300")

	return c.SendStream(reader)
}
