// Package business serves the Business page routes: details, logo and export.
package business

import (
	"bytes"
	"encoding/json"

	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	svc "github.com/connor-davis/3reco/internal/services/business"
	profilesvc "github.com/connor-davis/3reco/internal/services/profile"
)

// Handler serves /api/business. Every route works on the caller's active
// business; none takes a business id.
type Handler struct {
	svc      *svc.Service
	profiles *profilesvc.Service
}

// New builds the handler. The logo reuses the profile service's image rules.
func New(service *svc.Service, profiles *profilesvc.Service) *Handler {
	return &Handler{svc: service, profiles: profiles}
}

// Register adds the business routes under /api.
func (h *Handler) Register(router fiber.Router) {
	owner := middleware.RequireBusiness("owner")

	router.Get("/business", middleware.RequireUser, h.find)
	router.Patch("/business", middleware.RequireUser, h.update)
	router.Post("/business/logo", middleware.RequireUser, owner, h.uploadLogo)
	router.Delete("/business/logo", middleware.RequireUser, owner, h.deleteLogo)
	router.Get("/business/export", middleware.RequireUser, owner, h.export)
}

func (h *Handler) find(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	item, err := h.svc.Find(c.Context(), user)
	if err != nil {
		return err
	}

	return c.JSON(item)
}

func (h *Handler) update(c fiber.Ctx) error {
	var in svc.Input
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&in); err != nil {
		return apperr.BadRequest("Send editable business fields only.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := h.svc.Update(c.Context(), user, in); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *Handler) uploadLogo(c fiber.Ctx) error {
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

	if err := h.profiles.UploadAvatar(c.Context(), user.ActiveBusinessID, reader, true); err != nil {
		return err
	}

	return h.find(c)
}

func (h *Handler) deleteLogo(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	if err := h.profiles.DeleteAvatar(c.Context(), user.ActiveBusinessID, true); err != nil {
		return err
	}

	return h.find(c)
}

func (h *Handler) export(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	data, err := h.svc.Export(c.Context(), user)
	if err != nil {
		return err
	}

	c.Set("Content-Disposition", `attachment; filename="3reco-business-data.json"`)
	c.Set("Cache-Control", "no-store")

	return c.JSON(data)
}
