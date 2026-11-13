// Package team owns business people, role safety and invitation rules.
package team

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/database"
	mailer "github.com/connor-davis/3reco/internal/platform/mail"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/realtime"
	authstore "github.com/connor-davis/3reco/internal/stores/auth"
	"github.com/connor-davis/3reco/internal/stores/businesses"
)

// InviteTTL is the lifetime of each emailed invitation link.
const InviteTTL = 7 * 24 * time.Hour

// Service applies owner-only Team rules in the selected business.
type Service struct {
	db     *database.DB
	store  *businesses.Store
	people *authstore.Store
	hub    *realtime.Hub
	mail   *mailer.Mailer
	cfg    config.Config
}

// New builds the Team service with the existing business store.
func New(
	db *database.DB,
	store *businesses.Store,
	people *authstore.Store,
	hub *realtime.Hub,
	mail *mailer.Mailer,
	cfg config.Config,
) *Service {
	return &Service{db: db, store: store, people: people, hub: hub, mail: mail, cfg: cfg}
}

// Directory holds the owner-visible people and pending invitations.
type Directory struct {
	Members []businesses.Member `json:"members"`
	Invites []businesses.Invite `json:"invites"`
}

// List returns only the selected business's team.
func (s *Service) List(ctx context.Context, user auth.User) (Directory, error) {
	if err := s.owner(ctx, user); err != nil {
		return Directory{}, err
	}

	members, err := s.store.Members(ctx, user.ActiveBusinessID)
	if err != nil {
		return Directory{}, err
	}

	invites, err := s.store.Invites(ctx, user.ActiveBusinessID)

	return Directory{Members: members, Invites: invites}, err
}

func (s *Service) owner(ctx context.Context, user auth.User) error {
	if err := auth.RequireBusiness(user, "owner"); err != nil {
		return err
	}

	role, _, err := s.store.Membership(ctx, user.ActiveBusinessID, user.ID)
	if err != nil {
		return err
	}
	if role != "owner" {
		return apperr.Forbidden("Only an Owner can manage the team.")
	}

	return nil
}

func (s *Service) write(ctx context.Context, user auth.User, change func(context.Context) error) error {
	if err := auth.RequireBusiness(user, "owner"); err != nil {
		return err
	}

	return s.db.InTx(database.WithActor(ctx, user.ID, user.ActiveBusinessID), func(ctx context.Context) error {
		found, err := s.store.Lock(ctx, user.ActiveBusinessID)
		if err != nil {
			return err
		}
		if !found {
			return apperr.NotFound("Business not found.")
		}
		if err := s.owner(ctx, user); err != nil {
			return err
		}

		return change(ctx)
	})
}

func validRole(role string) error {
	if role != "owner" && role != "manager" && role != "member" {
		return apperr.Field("role", "Choose Owner, Manager or Member.")
	}

	return nil
}

// ChangeRole changes one person's membership, preserving at least one owner.
func (s *Service) ChangeRole(ctx context.Context, user auth.User, memberID, role string) error {
	if err := validRole(role); err != nil {
		return err
	}

	return s.write(ctx, user, func(ctx context.Context) error {
		if err := s.checkMemberChange(ctx, user, memberID, role); err != nil {
			return err
		}
		if err := s.store.SetMemberRole(ctx, user.ActiveBusinessID, memberID, role); err != nil {
			return err
		}

		s.recheck(ctx, memberID)

		return nil
	})
}

// Remove deletes one membership without ending any of the person's sign-ins.
func (s *Service) Remove(ctx context.Context, user auth.User, memberID string) error {
	return s.write(ctx, user, func(ctx context.Context) error {
		if user.ID == memberID {
			return apperr.Forbidden("Ask another Owner to remove you from the team.")
		}
		if err := s.checkMemberChange(ctx, user, memberID, ""); err != nil {
			return err
		}
		if err := s.store.RemoveMember(ctx, user.ActiveBusinessID, memberID); err != nil {
			return err
		}

		s.recheck(ctx, memberID)

		return nil
	})
}

func (s *Service) checkMemberChange(ctx context.Context, user auth.User, memberID, next string) error {
	role, _, err := s.store.Membership(ctx, user.ActiveBusinessID, memberID)
	if err != nil {
		return err
	}
	if role == "" {
		return apperr.NotFound("Team member not found.")
	}

	if role == "owner" && next != "owner" {
		count, err := s.store.OwnerCount(ctx, user.ActiveBusinessID)
		if err != nil {
			return err
		}
		if count <= 1 {
			return apperr.Conflict("Keep at least one Owner on the team.")
		}
	}

	return nil
}

func (s *Service) recheck(ctx context.Context, userID string) {
	database.AfterCommit(ctx, func() { s.hub.RecheckUser(context.WithoutCancel(ctx), userID) })
}

func inviteError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.BadRequest("This link is not valid any more. Ask for a new one.", nil)
	}

	return err
}
