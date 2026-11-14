package admin

import (
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	tstore "github.com/connor-davis/3reco/internal/stores/transactions"
)

// DuplicateGroup holds reviewable trades with the suggested original first.
type DuplicateGroup struct {
	Kind       string               `json:"kind"`
	OriginalID string               `json:"original_id"`
	Trades     []tstore.Transaction `json:"trades"`
}

// DuplicateReview includes live candidates and retained marked copies.
type DuplicateReview struct {
	Groups []DuplicateGroup     `json:"groups"`
	Marked []tstore.Transaction `json:"marked"`
}

// Duplicates runs the scan only when an admin opens the review page.
func (s *Service) Duplicates(ctx context.Context, user auth.User) (DuplicateReview, error) {
	out := DuplicateReview{Groups: []DuplicateGroup{}, Marked: []tstore.Transaction{}}
	if err := requireAdmin(user); err != nil {
		return out, err
	}

	groups, err := s.store.DuplicateGroups(ctx)
	if err != nil {
		return out, err
	}

	for _, candidate := range groups {
		group := DuplicateGroup{Kind: candidate.Kind, OriginalID: candidate.IDs[0]}
		for _, id := range candidate.IDs {
			trade, err := s.trades.Get(ctx, id)
			if err != nil {
				return out, err
			}

			group.Trades = append(group.Trades, trade)
		}

		out.Groups = append(out.Groups, group)
	}

	marked, err := s.store.MarkedDuplicates(ctx)
	if err != nil {
		return out, err
	}

	for _, id := range marked {
		trade, err := s.trades.Get(ctx, id)
		if err != nil {
			return out, err
		}

		out.Marked = append(out.Marked, trade)
	}

	return out, nil
}

// MarkDuplicate reverses only a confirmed exact c2b copy's stock, atomically.
func (s *Service) MarkDuplicate(ctx context.Context, user auth.User, id, original string) error {
	if err := requireAdmin(user); err != nil {
		return err
	}

	return s.db.InTx(database.WithActor(ctx, user.ID), func(ctx context.Context) error {
		if err := s.store.LockDuplicateTrades(ctx, []string{id, original}); err != nil {
			return err
		}

		trade, err := s.duplicateTrade(ctx, id)
		if err != nil {
			return err
		}

		if trade.Type != "c2b" {
			return apperr.BadRequest("Business trades cannot be marked as duplicates here.", nil)
		}

		matches, err := s.store.ExactDuplicate(ctx, id, original)
		if err != nil {
			return err
		}
		if !matches {
			return apperr.Conflict("Only complete trades with exactly matching items can be marked.")
		}

		copies, err := s.store.HasDuplicateCopies(ctx, id)
		if err != nil {
			return err
		}
		if copies {
			return apperr.Conflict("This trade is the original for other duplicates. Undo those first.")
		}

		// Follow normal trades' material lock order. Take writes fresh audit
		// entries; old items and audit rows are never changed.
		items := slices.Clone(trade.Items)
		slices.SortFunc(items, func(a, b tstore.Item) int {
			return strings.Compare(a.MaterialID, b.MaterialID)
		})
		for _, item := range items {
			stockID, _, found, err := s.trades.LockStock(ctx, trade.Buyer.ID, item.MaterialID, "")
			if err != nil {
				return err
			}

			taken := false
			if found {
				taken, err = s.trades.Take(ctx, stockID, item.Weight)
				if err != nil {
					return err
				}
			}
			if !taken {
				return apperr.Conflict(
					"This stock has already been used, so this can't be marked as a duplicate.",
				)
			}
		}

		return s.store.SetDuplicate(ctx, id, original, user.ID)
	})
}

func (s *Service) duplicateTrade(ctx context.Context, id string) (tstore.Transaction, error) {
	trade, err := s.trades.Get(ctx, id)
	if errors.Is(err, tstore.ErrNotFound) {
		return trade, apperr.NotFound("Trade not found.")
	}

	return trade, err
}

// UndoDuplicate restores the copy and adds stock back with a new audit entry.
func (s *Service) UndoDuplicate(ctx context.Context, user auth.User, id string) error {
	if err := requireAdmin(user); err != nil {
		return err
	}

	return s.db.InTx(database.WithActor(ctx, user.ID), func(ctx context.Context) error {
		if err := s.store.LockDuplicateTrades(ctx, []string{id}); err != nil {
			return err
		}

		trade, err := s.duplicateTrade(ctx, id)
		if err != nil {
			return err
		}
		if trade.Status != "duplicate" || trade.Type != "c2b" {
			return apperr.Conflict("This trade is not a marked collection duplicate.")
		}

		items := slices.Clone(trade.Items)
		slices.SortFunc(items, func(a, b tstore.Item) int {
			return strings.Compare(a.MaterialID, b.MaterialID)
		})
		for _, item := range items {
			err := s.trades.Give(ctx, trade.Buyer.ID, item.MaterialID, item.Weight, database.NewID())
			if err != nil {
				return err
			}
		}

		return s.store.SetDuplicate(ctx, id, "", user.ID)
	})
}

// DismissDuplicates records the exact current group the admin has reviewed.
func (s *Service) DismissDuplicates(ctx context.Context, user auth.User, ids []string) error {
	if err := requireAdmin(user); err != nil {
		return err
	}

	ids = slices.Clone(ids)
	slices.Sort(ids)
	if len(ids) < 2 || len(slices.Compact(slices.Clone(ids))) != len(ids) {
		return apperr.BadRequest("Choose a duplicate group to dismiss.", nil)
	}

	return s.db.InTx(database.WithActor(ctx, user.ID), func(ctx context.Context) error {
		if err := s.store.LockDuplicateTrades(ctx, ids); err != nil {
			return err
		}

		groups, err := s.store.DuplicateGroups(ctx)
		if err != nil {
			return err
		}

		for _, group := range groups {
			slices.Sort(group.IDs)
			if slices.Equal(ids, group.IDs) {
				return s.store.DismissDuplicates(ctx, ids, user.ID)
			}
		}

		return apperr.Conflict("This group has changed. Refresh it before deciding.")
	})
}
