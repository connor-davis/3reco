// Package profile serves caller profiles and safe account directory reads.
package profile

import (
	"bytes"
	"encoding/json"

	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	svc "github.com/connor-davis/3reco/internal/services/profile"
)

// Handler serves profile routes.
type Handler struct{ svc *svc.Service }

// New builds the handler.
func New(service *svc.Service) *Handler { return &Handler{svc: service} }

// Register adds profile and directory routes under /api.
func (handler *Handler) Register(router fiber.Router) {
	router.Get("/profile/optional", handler.optional)
	router.Get("/profile", middleware.RequireUser, handler.find)
	router.Patch("/profile", middleware.RequireUser, handler.update)
	router.Post("/profile/setup", middleware.RequireUser, handler.setup)
	router.Post("/profile/avatar", middleware.RequireUser, handler.uploadAvatar)
	router.Delete("/profile/avatar", middleware.RequireUser, handler.deleteAvatar)
	router.Get("/users/:id/avatar", handler.avatar)
	router.Get("/users", middleware.RequireUser, handler.directory)
	router.Get("/users/:id", handler.public)
}

func (handler *Handler) find(c fiber.Ctx) error {
	user, _ := middleware.CurrentUser(c)
	item, err := handler.svc.Find(c.Context(), user.ID)
	if err != nil {
		return err
	}

	return c.JSON(item)
}

func (handler *Handler) optional(c fiber.Ctx) error {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		return c.JSON(nil)
	}

	// This route is public, so it always uses the directory allowlist.
	item, err := handler.svc.Public(c.Context(), user.ID)
	if err != nil {
		return err
	}

	return c.JSON(item)
}

func (handler *Handler) public(c fiber.Ctx) error {
	item, err := handler.svc.Public(c.Context(), c.Params("id"))
	if err != nil {
		return err
	}

	return c.JSON(item)
}

func (handler *Handler) directory(c fiber.Ctx) error {
	if c.Query("role") != "collector" {
		return apperr.Field("role", "Choose the collector directory.")
	}

	query, err := paging.Parse(c.Query("cursor"), c.Query("limit"), false)
	if err != nil {
		return err
	}

	items, err := handler.svc.Directory(c.Context(), query)
	if err != nil {
		return err
	}

	return c.JSON(items)
}

func (handler *Handler) update(c fiber.Ctx) error {
	var in svc.Input
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&in); err != nil {
		return apperr.BadRequest(
			"Send editable profile fields only. Email changes require verification.",
			nil,
		)
	}

	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.Update(c.Context(), user.ID, in); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (handler *Handler) setup(c fiber.Ctx) error {
	var in struct {
		Role string `json:"role"`
	}
	if err := c.Bind().JSON(&in); err != nil {
		return apperr.BadRequest("Send the account type you chose.", nil)
	}

	user, _ := middleware.CurrentUser(c)
	if err := handler.svc.Setup(c.Context(), user.ID, in.Role); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"ok": true})
}
