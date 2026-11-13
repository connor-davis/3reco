package admin

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/notifications"
	"github.com/connor-davis/3reco/internal/services/privacy"
	"github.com/connor-davis/3reco/internal/stores/businesses"
)

// SetBusinessVerified verifies a business, or takes the verification away. A
// verified business may see and edit every collector. Only admins may do it,
// and only for a user whose role is business.
func (s *Service) SetBusinessVerified(ctx context.Context, user auth.User, id string, verified bool) error {
	if err := requireAdmin(user); err != nil {
		return err
	}

	return s.db.InTx(ctx, func(ctx context.Context) error {
		found, err := businesses.New(s.db).Lock(ctx, id)
		if err != nil {
			return err
		}

		if !found {
			_, personFound, err := s.store.LockActiveRole(ctx, id)
			if err != nil {
				return err
			}
			if !personFound {
				return apperr.NotFound("Business not found.")
			}

			return apperr.Field("verified", "Only a business can be verified.")
		}

		if err := s.store.SetBusinessVerified(ctx, id, user.ID, verified); err != nil {
			return err
		}

		if err := s.audit.Record(ctx, user.ID, id, privacy.KindBusinessVerify); err != nil {
			return err
		}

		title, body := "Business verified", "Your business is verified. You can now see and edit every collector."
		if !verified {
			title, body = "Verification removed", "Your business verification was removed."
		}

		if err := s.notes.Notify(ctx, id, notifications.BusinessVerified, title, body, "/collectors"); err != nil {
			return err
		}

		// Only after the commit: open sockets keep their old view until it lands.
		database.AfterCommit(ctx, func() { s.hub.RecheckUser(context.WithoutCancel(ctx), id) })

		return nil
	})
}
