package team

import (
	"context"
	"errors"
	"strings"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	authstore "github.com/connor-davis/3reco/internal/stores/auth"
)

// Acceptance is either a signed-in acceptance or a new person's account details.
type Acceptance struct {
	Token                string `json:"token"`
	Name                 string `json:"name"`
	Password             string `json:"password"`
	AcceptedTermsVersion string `json:"accepted_terms_version"`
}

// Accept consumes a live invitation once, proving the email for a new account.
// Auth routes have no ActorTx, so this transaction names the invited business.
func (s *Service) Accept(ctx context.Context, session *auth.Session, in Acceptance) error {
	preview, err := s.store.InviteByHash(ctx, auth.HashToken(in.Token), false)
	if err != nil {
		return inviteError(err)
	}

	actor, passwordHash := "", ""
	if session != nil {
		actor = session.User.ID
	} else {
		if strings.TrimSpace(in.Name) == "" || in.Password == "" {
			return apperr.Unauthorized("Sign in with the invited email, or create your account.")
		}
		if in.AcceptedTermsVersion != config.NoticeVersion {
			return apperr.Field("accepted_terms_version", "Please accept the current privacy notice.")
		}
		if err := auth.CheckPassword(in.Password); err != nil {
			return err
		}

		passwordHash, err = auth.HashPassword(in.Password)
		if err != nil {
			return err
		}
	}

	return s.db.InTx(database.WithActor(ctx, actor, preview.BusinessID), func(ctx context.Context) error {
		found, err := s.store.Lock(ctx, preview.BusinessID)
		if err != nil {
			return err
		}
		if !found {
			return inviteErrorNotValid()
		}

		invite, err := s.store.InviteByHash(ctx, auth.HashToken(in.Token), true)
		if err != nil {
			return inviteError(err)
		}

		var user auth.User
		if session != nil {
			user, err = s.people.UserByID(ctx, actor)
			if err != nil {
				return err
			}
			if user.IsRemoved || user.Email == nil || !strings.EqualFold(*user.Email, invite.Email) {
				return apperr.Forbidden("Sign in with the email address this invitation was sent to.")
			}
		} else {
			user, err = s.people.CreateUser(ctx, authstore.NewUser{
				Name: strings.TrimSpace(in.Name), Email: invite.Email, PasswordHash: passwordHash,
				Role: auth.RoleGuest, Verified: true, NoticeVersion: in.AcceptedTermsVersion,
			})
			if errors.Is(err, authstore.ErrEmailTaken) {
				return apperr.Unauthorized("Sign in with the invited email to accept this invitation.")
			}
			if err != nil {
				return err
			}
			if err := s.store.SetAcceptActor(ctx, user.ID); err != nil {
				return err
			}
		}

		if err := s.store.PrepareInvitee(ctx, user.ID); err != nil {
			return err
		}
		if err := s.store.Join(ctx, invite.BusinessID, user.ID, invite.Role); err != nil {
			return err
		}
		if err := s.store.AcceptInvite(ctx, invite.ID); err != nil {
			return err
		}
		if session != nil {
			if err := s.store.SelectInvitedBusiness(ctx, session.ID, invite.BusinessID); err != nil {
				return err
			}
		}

		s.recheck(ctx, user.ID)

		return nil
	})
}

func inviteErrorNotValid() error {
	return apperr.BadRequest("This link is not valid any more. Ask for a new one.", nil)
}
