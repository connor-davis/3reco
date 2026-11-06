// Package admin holds the rules for the admin area: who may manage users,
// and the dashboards each role gets.
package admin

import (
	"context"
	"slices"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/invoices"
	"github.com/connor-davis/3reco/internal/services/privacy"
	store "github.com/connor-davis/3reco/internal/stores/admin"
	pstore "github.com/connor-davis/3reco/internal/stores/privacy"
	tstore "github.com/connor-davis/3reco/internal/stores/transactions"
)

// Roles an admin may hand out.
var roles = []string{auth.RoleGuest, auth.RoleAdmin, auth.RoleStaff, auth.RoleBusiness, auth.RoleCollector}

// Service is the admin rules. The routes check the caller's role, and the
// methods that change data check it again.
type Service struct {
	db       *database.DB
	store    *store.Store
	trades   *tstore.Store
	privacy  *privacy.Service
	audit    *pstore.Store
	invoices *invoices.Service
}

// New builds the service.
func New(
	db *database.DB,
	s *store.Store,
	trades *tstore.Store,
	privacyService *privacy.Service,
	audit *pstore.Store,
	invoiceService *invoices.Service,
) *Service {
	return &Service{db: db, store: s, trades: trades, privacy: privacyService, audit: audit, invoices: invoiceService}
}

func requireAdmin(user auth.User) error {
	if !auth.HasRole(user, auth.RoleAdmin) {
		return apperr.Forbidden("Only an admin can do this.")
	}

	return nil
}

// Users lists the people who have not been removed.
func (s *Service) Users(
	ctx context.Context,
	user auth.User,
	cursor string,
	limit int,
	search, role string,
) (paging.Page[store.User], error) {
	var empty paging.Page[store.User]

	if err := requireAdmin(user); err != nil {
		return empty, err
	}

	if role != "" && !slices.Contains(roles, role) {
		return empty, apperr.BadRequest("Pick admin, staff, business or collector.", nil)
	}

	cur, err := paging.ParseCursor(cursor)
	if err != nil {
		return empty, err
	}

	rows, err := s.store.Users(ctx, cur, limit, paging.SearchPattern(search), role)
	if err != nil {
		return empty, err
	}

	return paging.Build(rows, limit, func(u store.User) (time.Time, string) {
		return u.CreatedAt, u.ID
	}), nil
}

// SetRole changes a user's role. An admin cannot change their own, so the
// last admin can't lock everyone out.
func (s *Service) SetRole(ctx context.Context, user auth.User, id, role string) error {
	if err := requireAdmin(user); err != nil {
		return err
	}

	if !slices.Contains(roles, role) {
		return apperr.Field("role", "Pick guest, admin, staff, business or collector.")
	}

	if id == user.ID {
		return apperr.Forbidden("You cannot change your own role.")
	}

	return s.db.InTx(ctx, func(ctx context.Context) error {
		found, err := s.store.LockActive(ctx, id)
		if err != nil {
			return err
		}

		if !found {
			return apperr.NotFound("User not found.")
		}

		return s.store.SetRole(ctx, id, role)
	})
}

// Remove erases a user. Their finished transactions stay, under the name
// "Removed account", and every invoice that named them is rebuilt. It is the
// same erase a person can ask for themself.
func (s *Service) Remove(ctx context.Context, user auth.User, id string) error {
	if err := requireAdmin(user); err != nil {
		return err
	}

	if id == user.ID {
		return apperr.Forbidden("You cannot remove your own account.")
	}

	return s.privacy.Erase(ctx, user.ID, id)
}
