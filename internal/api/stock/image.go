package stock

import (
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
)

func (handler *Handler) addPhoto(c fiber.Ctx) error {
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

	if err := handler.svc.AddPhoto(c.Context(), c.Params("id"), auth.PartyID(user), reader); err != nil {
		return err
	}

	return handler.find(c)
}

func (handler *Handler) deletePhoto(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.DeletePhoto(
		c.Context(),
		c.Params("id"),
		c.Params("photo_id"),
		auth.PartyID(user),
	); err != nil {
		return err
	}

	return handler.find(c)
}

func (handler *Handler) orderPhotos(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)

	var body struct {
		IDs []string `json:"ids"`
	}
	if err := c.Bind().Body(&body); err != nil {
		return apperr.BadRequest("Send the photo ids in the order you want.", nil)
	}

	if err := handler.svc.ReorderPhotos(c.Context(), c.Params("id"), auth.PartyID(user), body.IDs); err != nil {
		return err
	}

	return handler.find(c)
}

// photo streams one photo; without :photo_id it is the cover.
func (handler *Handler) photo(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	staff := auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff)

	reader, kind, err := handler.svc.Photo(
		c.Context(),
		c.Params("id"),
		c.Params("photo_id"),
		auth.PartyID(user),
		staff,
	)
	if err != nil {
		return err
	}

	c.Set("Content-Type", kind)
	c.Set("Cache-Control", "private, max-age=60")

	return c.SendStream(reader)
}
