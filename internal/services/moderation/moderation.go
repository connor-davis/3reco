// Package moderation validates private reports and business-wide blocks.
package moderation

import (
	"context"
	"errors"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/notifications"
	store "github.com/connor-davis/3reco/internal/stores/moderation"
)

// Service owns moderation access and transitions.
type Service struct {
	db    *database.DB
	store *store.Store
	notes *notifications.Service
}

// New builds the service.
func New(db *database.DB, rows *store.Store, notes *notifications.Service) *Service {
	return &Service{db: db, store: rows, notes: notes}
}

// RequireContact rejects either direction of a block and suspended businesses.
func RequireContact(ctx context.Context, db *database.DB, left, right string) error {
	allowed, err := store.ContactAllowed(ctx, db, left, right)
	if err != nil {
		return err
	}

	if !allowed {
		return apperr.Forbidden("Contact is not available between these businesses.")
	}

	return nil
}

// Blocks lists blocks for the active business, including ordinary team members.
func (s *Service) Blocks(ctx context.Context, user auth.User) ([]store.Block, error) {
	if err := auth.RequireBusiness(user, "member"); err != nil {
		return nil, err
	}

	return s.store.Blocks(ctx, auth.PartyID(user))
}

// Block lets managers stop contact for their whole business.
func (s *Service) Block(ctx context.Context, user auth.User, target string) error {
	if err := auth.RequireBusiness(user, "manager"); err != nil {
		return err
	}

	if target == auth.PartyID(user) {
		return apperr.BadRequest("You cannot block your own business.", nil)
	}

	exists, err := s.store.Exists(ctx, target)
	if err != nil {
		return err
	}

	if !exists {
		return apperr.NotFound("Business not found.")
	}

	return s.store.Block(ctx, auth.PartyID(user), target, user.ID)
}

// Unblock removes only this business's outgoing block.
func (s *Service) Unblock(ctx context.Context, user auth.User, target string) error {
	if err := auth.RequireBusiness(user, "manager"); err != nil {
		return err
	}

	return s.store.Unblock(ctx, auth.PartyID(user), target)
}

// Input is a report's allowlisted target, reason and private details.
type Input struct {
	TargetKind string `json:"target_kind"`
	TargetID   string `json:"target_id"`
	Reason     string `json:"reason"`
	Details    string `json:"details"`
}

// Report validates the finite reason set and enforces one active report in SQL.
func (s *Service) Report(ctx context.Context, user auth.User, in Input) (string, error) {
	if err := auth.RequireBusiness(user, "manager"); err != nil {
		return "", err
	}

	if in.TargetKind != "listing" && in.TargetKind != "party" {
		return "", apperr.Field("target_kind", "Choose a listing or business.")
	}

	if !slices.Contains([]string{"scam", "wrong_info", "offensive", "spam", "other"}, in.Reason) {
		return "", apperr.Field("reason", "Choose a reason.")
	}

	in.Details = strings.TrimSpace(in.Details)
	if utf8.RuneCountInString(in.Details) > 1000 {
		return "", apperr.Field("details", "Use at most 1000 characters.")
	}

	party, err := s.store.TargetParty(ctx, in.TargetKind, in.TargetID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", apperr.NotFound("Report target not found.")
	}
	if err != nil {
		return "", err
	}

	if party == auth.PartyID(user) {
		return "", apperr.BadRequest("You cannot report your own business.", nil)
	}

	id := database.NewID()
	err = s.store.CreateReport(
		ctx,
		id,
		auth.PartyID(user),
		user.ID,
		in.TargetKind,
		in.TargetID,
		party,
		in.Reason,
		in.Details,
	)
	if constraint, ok := database.IsUnique(err); ok && constraint == "reports_active_idx" {
		return "", apperr.Conflict("You already have an open report for this reason.")
	}

	return id, err
}

// Mine returns only statuses of reports made by this business.
func (s *Service) Mine(ctx context.Context, user auth.User) ([]store.ReportStatus, error) {
	if err := auth.RequireBusiness(user, "member"); err != nil {
		return nil, err
	}

	return s.store.Mine(ctx, auth.PartyID(user))
}

func requireAdmin(user auth.User) error {
	if !auth.HasRole(user, auth.RoleAdmin) {
		return apperr.Forbidden("Only an admin can do this.")
	}

	return nil
}

// Queue exposes private reports only to admins.
func (s *Service) Queue(ctx context.Context, user auth.User) ([]store.Report, error) {
	if err := requireAdmin(user); err != nil {
		return nil, err
	}

	return s.store.Queue(ctx)
}

// Resolve closes a report once; all changes and the generic notice commit together.
func (s *Service) Resolve(ctx context.Context, user auth.User, id, action string) error {
	if err := requireAdmin(user); err != nil {
		return err
	}

	statuses := map[string]string{"dismiss": "dismissed", "remove_listing": "listing_removed", "suspend": "suspended"}
	status, ok := statuses[action]
	if !ok {
		return apperr.Field("action", "Choose a report action.")
	}

	return s.db.InTx(ctx, func(ctx context.Context) error {
		report, err := s.store.LockReport(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("Report not found.")
		}
		if err != nil {
			return err
		}

		if report.Status != "open" {
			return apperr.Conflict("This report is already closed.")
		}

		switch action {
		case "remove_listing":
			if report.TargetKind != "listing" {
				return apperr.BadRequest("This report is not about a listing.", nil)
			}
			if err := s.store.RemoveListing(ctx, report.TargetID); err != nil {
				return err
			}
		case "suspend":
			if err := s.store.Suspend(ctx, report.PartyID, user.ID, true); err != nil {
				return err
			}
		}

		if err := s.store.CloseReport(ctx, id, user.ID, status); err != nil {
			return err
		}

		if err := s.store.AuditAction(ctx, user.ID, id, action); err != nil {
			return err
		}

		return s.notes.Notify(
			ctx,
			report.ReporterID,
			notifications.ReportClosed,
			"Report reviewed",
			"Thanks, we looked at your report.",
			"",
		)
	})
}

// Unsuspend restores contact eligibility, keeping any existing blocks in force.
func (s *Service) Unsuspend(ctx context.Context, user auth.User, party string) error {
	if err := requireAdmin(user); err != nil {
		return err
	}

	return s.db.InTx(ctx, func(ctx context.Context) error {
		exists, err := s.store.Exists(ctx, party)
		if err != nil {
			return err
		}

		if !exists {
			return apperr.NotFound("Business not found.")
		}

		if err := s.store.Suspend(ctx, party, user.ID, false); err != nil {
			return err
		}

		return s.store.AuditAction(ctx, user.ID, party, "unsuspend")
	})
}
