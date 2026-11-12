package stock

import (
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
)

func (handler *Handler) uploadImage(c fiber.Ctx) error {
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

	if err := handler.svc.UploadImage(c.Context(), c.Params("id"), user.ID, reader); err != nil {
		return err
	}

	return handler.find(c)
}

func (handler *Handler) deleteImage(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.DeleteImage(c.Context(), c.Params("id"), user.ID); err != nil {
		return err
	}

	return handler.find(c)
}

func (handler *Handler) image(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	reader, kind, err := handler.svc.Image(c.Context(), c.Params("id"), user.ID)
	if err != nil {
		return err
	}

	c.Set("Content-Type", kind)
	c.Set("Cache-Control", "private, max-age=60")

	return c.SendStream(reader)
}
