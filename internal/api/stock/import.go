package stock

import (
	"io"

	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
	svc "github.com/connor-davis/3reco/internal/services/stock"
)

type importBody struct {
	Rows []svc.ImportRow `json:"rows"`
}

// previewImport reads an uploaded CSV, or re-checks rows the person fixed on
// screen. It never writes.
func (handler *Handler) previewImport(c fiber.Ctx) error {
	rows, err := importRows(c)
	if err != nil {
		return err
	}

	preview, err := handler.svc.PreviewImport(c.Context(), rows)
	if err != nil {
		return err
	}

	return c.JSON(preview)
}

func (handler *Handler) commitImport(c fiber.Ctx) error {
	var body importBody
	if err := c.Bind().JSON(&body); err != nil {
		return apperr.BadRequest("Send the lines as JSON.", nil)
	}

	user, _ := middleware.CurrentUser(c)

	count, err := handler.svc.CommitImport(c.Context(), auth.PartyID(user), body.Rows)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"count": count})
}

func importRows(c fiber.Ctx) ([]svc.ImportRow, error) {
	file, err := c.FormFile("file")
	if err != nil {
		var body importBody
		if err := c.Bind().JSON(&body); err != nil {
			return nil, apperr.BadRequest("Choose a CSV file.", nil)
		}

		return body.Rows, nil
	}

	if file.Size > svc.MaxImportBytes {
		return nil, apperr.BadRequest("That file is too big. Keep it under 1 MB.", nil)
	}

	reader, err := file.Open()
	if err != nil {
		return nil, apperr.BadRequest("Could not read the file.", nil)
	}
	defer reader.Close()

	data, err := io.ReadAll(io.LimitReader(reader, svc.MaxImportBytes+1))
	if err != nil || len(data) > svc.MaxImportBytes {
		return nil, apperr.BadRequest("That file is too big. Keep it under 1 MB.", nil)
	}

	return svc.ParseImport(data)
}
