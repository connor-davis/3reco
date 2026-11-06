// Package privacy holds the rules for POPIA and GDPR rights: a person's own
// data export, deleting their account, the privacy notice they accept, the
// audit log and the retention clean-up.
package privacy

import (
	"context"
	"encoding/json"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/platform/storage"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/notifications"
	"github.com/connor-davis/3reco/internal/services/realtime"
	"github.com/connor-davis/3reco/internal/services/transactions"
	collectors "github.com/connor-davis/3reco/internal/stores/collectors"
	store "github.com/connor-davis/3reco/internal/stores/privacy"
	profile "github.com/connor-davis/3reco/internal/stores/profile"
)

// Audit kinds written to the privacy log.
const (
	KindExport        = "export"
	KindDelete        = "delete"
	KindAdminFullView = "admin_full_view"
)

// Service owns the privacy rules.
type Service struct {
	db         *database.DB
	store      *store.Store
	profiles   *profile.Store
	collectors *collectors.Store
	auth       *auth.Service
	trades     *transactions.Service
	notes      *notifications.Service
	hub        *realtime.Hub
	objects    *storage.Client
}

// New builds the service.
func New(
	db *database.DB,
	rows *store.Store,
	profiles *profile.Store,
	collectorRows *collectors.Store,
	authService *auth.Service,
	trades *transactions.Service,
	notes *notifications.Service,
	hub *realtime.Hub,
	objects *storage.Client,
) *Service {
	return &Service{
		db: db, store: rows, profiles: profiles, collectors: collectorRows, auth: authService,
		trades: trades, notes: notes, hub: hub, objects: objects,
	}
}

// Notice says which privacy notice is current and whether the caller accepted it.
type Notice struct {
	Version  string `json:"version"`
	Accepted bool   `json:"accepted"`
}

// Notice reads the caller's acceptance of the current version.
func (s *Service) Notice(ctx context.Context, user auth.User) (Notice, error) {
	accepted, err := s.store.Accepted(ctx, user.ID, config.NoticeVersion)

	return Notice{Version: config.NoticeVersion, Accepted: accepted}, err
}

// Accept records that the caller accepted the current privacy notice.
func (s *Service) Accept(ctx context.Context, user auth.User) error {
	return s.store.Accept(ctx, user.ID, config.NoticeVersion)
}

// Events lists the audit log. Only an admin may read it.
func (s *Service) Events(
	ctx context.Context,
	user auth.User,
	cursor string,
	limit int,
) (paging.Page[store.Event], error) {
	var empty paging.Page[store.Event]

	if !auth.HasRole(user, auth.RoleAdmin) {
		return empty, apperr.Forbidden("Only an admin can do this.")
	}

	cur, err := paging.ParseCursor(cursor)
	if err != nil {
		return empty, err
	}

	rows, err := s.store.Events(ctx, cur, limit)
	if err != nil {
		return empty, err
	}

	return paging.Build(rows, limit, func(e store.Event) (time.Time, string) {
		return e.CreatedAt, e.ID
	}), nil
}

// Export returns everything the caller's own account holds about them. The
// route has no id: it can only ever read the caller.
func (s *Service) Export(ctx context.Context, user auth.User) (map[string]any, error) {
	data, err := s.store.Export(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	out := make(map[string]any, len(data)+3)
	for name, rows := range data {
		out[name] = json.RawMessage(rows)
	}

	if out["profile"], err = s.profiles.Find(ctx, user.ID, false); err != nil {
		return nil, err
	}

	created, err := s.collectors.Created(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	// Staff and admins who recorded a collector do not get the full number
	// back; the creating business does, as everywhere else.
	for i := range created {
		if created[i].CreatedByBusinessID == nil || *created[i].CreatedByBusinessID != user.ID {
			created[i].BankAccountNumber = crypt.Mask(created[i].BankAccountNumber)
			created[i].EwalletPaymentID = crypt.Mask(created[i].EwalletPaymentID)
		}
	}

	out["collectors_created"] = created
	out["exported_at"] = time.Now().UTC()

	return out, s.store.RecordExport(ctx, user.ID, user.ID, "personal", map[string]string{})
}
