package team

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	mailer "github.com/connor-davis/3reco/internal/platform/mail"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/stores/businesses"
)

// Invite creates one pending invitation for an address in the active business.
func (s *Service) Invite(ctx context.Context, user auth.User, email, role string) error {
	email, err := auth.CleanEmail(email)
	if err != nil {
		return err
	}
	if err := validRole(role); err != nil {
		return err
	}

	return s.write(ctx, user, func(ctx context.Context) error {
		if err := s.manage(ctx, user, "", role); err != nil {
			return err
		}

		member, err := s.store.HasMemberEmail(ctx, user.ActiveBusinessID, email)
		if err != nil {
			return err
		}
		if member {
			return apperr.Conflict("This person is already on the team.")
		}

		token, hash := auth.NewToken()
		in := businesses.Invite{
			ID: database.NewID(), BusinessID: user.ActiveBusinessID, Email: email,
			Role: role, TokenHash: hash, ExpiresAt: time.Now().Add(InviteTTL),
		}
		if err := s.store.InsertInvite(ctx, in, user.ID); err != nil {
			if _, duplicate := database.IsUnique(err); duplicate {
				return apperr.Conflict("This person already has an invitation. Resend it from Team.")
			}

			return err
		}

		return s.sendInvite(ctx, in, token)
	})
}

// Resend rotates the existing invitation's token and seven-day expiry.
func (s *Service) Resend(ctx context.Context, user auth.User, id string) error {
	return s.write(ctx, user, func(ctx context.Context) error {
		in, err := s.store.InviteByID(ctx, user.ActiveBusinessID, id)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("Invitation not found.")
		}
		if err != nil {
			return err
		}

		if err := s.manage(ctx, user, "", in.Role); err != nil {
			return err
		}

		token, hash := auth.NewToken()
		if err := s.store.RotateInvite(ctx, user.ActiveBusinessID, id, hash, time.Now().Add(InviteTTL)); err != nil {
			return err
		}

		return s.sendInvite(ctx, in, token)
	})
}

// Revoke keeps the history but makes the pending link unusable.
func (s *Service) Revoke(ctx context.Context, user auth.User, id string) error {
	return s.write(ctx, user, func(ctx context.Context) error {
		in, err := s.store.InviteByID(ctx, user.ActiveBusinessID, id)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("Invitation not found.")
		}
		if err != nil {
			return err
		}

		if err := s.manage(ctx, user, "", in.Role); err != nil {
			return err
		}

		return s.store.RevokeInvite(ctx, user.ActiveBusinessID, id)
	})
}

func (s *Service) sendInvite(ctx context.Context, in businesses.Invite, token string) error {
	name, err := s.store.Name(ctx, in.BusinessID)
	if err != nil {
		return err
	}

	businessName := "a business"
	if name != nil && *name != "" {
		businessName = *name
	}
	message := mailer.ActionEmail(in.Email, "Join your 3rEco team", "Join "+businessName,
		"You have been invited as "+in.Role+". This link lasts 7 days.", "Join team",
		s.cfg.WebOrigin+"/accept-invite?token="+token)
	database.AfterCommit(ctx, func() { s.mail.SendAsync(message) })

	return nil
}

// Preview is public invitation context, with no account-existence information.
type Preview struct {
	BusinessName string `json:"business_name"`
	Role         string `json:"role"`
	Email        string `json:"email"`
}

// Preview checks a live token and masks the invited address.
func (s *Service) Preview(ctx context.Context, token string) (Preview, error) {
	in, err := s.store.InviteByHash(ctx, auth.HashToken(token), false)
	if err != nil {
		return Preview{}, inviteError(err)
	}

	name, err := s.store.Name(ctx, in.BusinessID)
	preview := Preview{Role: in.Role}
	if name != nil {
		preview.BusinessName = *name
	}
	parts := strings.SplitN(in.Email, "@", 2)
	preview.Email = parts[0][:1] + "***@" + parts[1]

	return preview, err
}
