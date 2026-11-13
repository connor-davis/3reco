package auth

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/stores/businesses"
)

// PartyID returns the active business for business ownership checks.
// Personal roles never stand in for a business membership, even for a founder.
func PartyID(user User) string {
	if user.ActiveBusinessID != "" && user.BusinessRole != "" {
		return user.ActiveBusinessID
	}

	return ""
}

// BusinessAtLeast checks the role in the active business, never the person's role.
func BusinessAtLeast(user User, minimum string) bool {
	ranks := map[string]int{"member": 1, "manager": 2, "owner": 3}

	return user.ActiveBusinessID != "" && ranks[minimum] > 0 &&
		ranks[user.BusinessRole] >= ranks[minimum]
}

// RequireBusiness checks the minimum role for a business action.
func RequireBusiness(user User, minimum string) error {
	if !BusinessAtLeast(user, minimum) {
		return apperr.Forbidden("You are not allowed to do that for this business.")
	}

	return nil
}

func (s *Service) loadBusiness(ctx context.Context, sess *Session) error {
	rows := businesses.New(s.db)
	if sess.ActiveBusinessID == "" {
		if err := rows.SelectDefault(ctx, sess.ID); err != nil {
			return err
		}

		fresh, err := s.store.SessionByID(ctx, sess.ID)
		if err != nil {
			return err
		}

		sess.ActiveBusinessID = fresh.ActiveBusinessID
	}

	role, verified, err := rows.Membership(ctx, sess.ActiveBusinessID, sess.User.ID)
	if err != nil {
		return err
	}

	sess.User.BusinessName = nil
	sess.User.BusinessRole = role
	sess.User.BusinessVerified = verified && role != ""
	if role != "" {
		sess.User.ActiveBusinessID = sess.ActiveBusinessID
		sess.User.BusinessName, err = rows.Name(ctx, sess.ActiveBusinessID)
		if err != nil {
			return err
		}
	}

	return nil
}
