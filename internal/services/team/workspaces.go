package team

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/stores/businesses"
)

// MyBusinesses returns the signed-in business person's memberships only.
func (s *Service) MyBusinesses(ctx context.Context, user auth.User) ([]businesses.Workspace, error) {
	if user.Role == nil || *user.Role != auth.RoleBusiness {
		return nil, apperr.Forbidden("Only business accounts can choose a workspace.")
	}

	return s.store.Mine(ctx, user.ID)
}

// SelectBusiness selects a membership for this session and rechecks its live sockets.
func (s *Service) SelectBusiness(ctx context.Context, session auth.Session, businessID string) error {
	if session.User.Role == nil || *session.User.Role != auth.RoleBusiness {
		return apperr.Forbidden("Only business accounts can choose a workspace.")
	}

	return s.db.InTx(ctx, func(ctx context.Context) error {
		found, err := s.store.Lock(ctx, businessID)
		if err != nil {
			return err
		}
		if !found {
			return apperr.NotFound("Business not found.")
		}

		role, _, err := s.store.Membership(ctx, businessID, session.User.ID)
		if err != nil {
			return err
		}
		if role == "" {
			return apperr.NotFound("Business not found.")
		}

		selected, err := s.store.Select(ctx, session.ID, businessID)
		if err != nil {
			return err
		}
		if !selected {
			return apperr.NotFound("Business not found.")
		}

		// Old sockets must stop receiving the previous business's private events.
		s.recheck(ctx, session.User.ID)

		return nil
	})
}
