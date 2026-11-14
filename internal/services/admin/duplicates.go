package admin

import (
	"cmp"
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	tstore "github.com/connor-davis/3reco/internal/stores/transactions"
)

// DuplicateTrade is a trade in a group, with what the admin needs to decide.
type DuplicateTrade struct {
	tstore.Transaction
	// SharedLines marks, per item in order, a line another trade in the group also has.
	SharedLines []bool `json:"shared_lines"`
	// ExactCopy is true when another trade in the group has exactly the same lines.
	ExactCopy bool `json:"exact_copy"`
	// ContainedIn is the trade this one can be deleted as a copy of, or empty.
	ContainedIn string `json:"contained_in"`
}

// DuplicateGroup is trades joined by shared lines: oldest date first, with the
// suggested original (most lines, then oldest recorded) named.
type DuplicateGroup struct {
	OriginalID string           `json:"original_id"`
	Trades     []DuplicateTrade `json:"trades"`
}

// DuplicateReview is the live groups an admin has not dismissed.
type DuplicateReview struct {
	Groups []DuplicateGroup `json:"groups"`
}

// components joins linked pairs into groups of connected trades, ids sorted.
func (s *Service) components(ctx context.Context) ([][]string, error) {
	pairs, err := s.store.LinkedPairs(ctx)
	if err != nil {
		return nil, err
	}

	parent := map[string]string{}

	var find func(string) string

	find = func(id string) string {
		if parent[id] == "" {
			parent[id] = id
		}

		if parent[id] != id {
			parent[id] = find(parent[id])
		}

		return parent[id]
	}

	for _, pair := range pairs {
		parent[find(pair[0])] = find(pair[1])
	}

	byRoot := map[string][]string{}
	for id := range parent {
		root := find(id)
		byRoot[root] = append(byRoot[root], id)
	}

	out := make([][]string, 0, len(byRoot))

	for _, ids := range byRoot {
		slices.Sort(ids)
		out = append(out, ids)
	}

	slices.SortFunc(out, slices.Compare)

	return out, nil
}

// Duplicates runs the scan only when an admin opens the review page.
func (s *Service) Duplicates(ctx context.Context, user auth.User) (DuplicateReview, error) {
	out := DuplicateReview{Groups: []DuplicateGroup{}}
	if err := requireAdmin(user); err != nil {
		return out, err
	}

	groups, err := s.components(ctx)
	if err != nil {
		return out, err
	}

	dismissed, err := s.store.Dismissed(ctx)
	if err != nil {
		return out, err
	}

	for _, ids := range groups {
		if slices.ContainsFunc(dismissed, func(d []string) bool { return slices.Equal(d, ids) }) {
			continue
		}

		trades := make([]tstore.Transaction, 0, len(ids))

		for _, id := range ids {
			trade, err := s.trades.Get(ctx, id)
			if err != nil {
				return out, err
			}

			trades = append(trades, trade)
		}

		out.Groups = append(out.Groups, buildGroup(trades))
	}

	// Biggest risk first: groups holding an exact copy, then the newest trade.
	slices.SortStableFunc(out.Groups, func(a, b DuplicateGroup) int {
		if x, y := hasExact(a), hasExact(b); x != y {
			if x {
				return -1
			}

			return 1
		}

		return newest(b).Compare(newest(a))
	})

	return out, nil
}

func hasExact(g DuplicateGroup) bool {
	return slices.ContainsFunc(g.Trades, func(t DuplicateTrade) bool { return t.ExactCopy })
}

func newest(g DuplicateGroup) time.Time {
	var at time.Time

	for _, t := range g.Trades {
		if t.EffectiveAt.After(at) {
			at = t.EffectiveAt
		}
	}

	return at
}

// moreLines orders the likelier original first: most lines, then oldest recorded.
func moreLines(a, b tstore.Transaction) int {
	return cmp.Or(cmp.Compare(len(b.Items), len(a.Items)), a.CreatedAt.Compare(b.CreatedAt),
		strings.Compare(a.ID, b.ID))
}

func buildGroup(trades []tstore.Transaction) DuplicateGroup {
	keys := map[string][]string{}
	for _, trade := range trades {
		keys[trade.ID] = tstore.LineKeys(trade.Items)
	}

	byOriginal := slices.Clone(trades)
	slices.SortFunc(byOriginal, moreLines)
	group := DuplicateGroup{OriginalID: byOriginal[0].ID}

	// Oldest collection date first; recorded time and id keep the order stable.
	ordered := slices.Clone(trades)
	slices.SortFunc(ordered, func(a, b tstore.Transaction) int {
		return cmp.Or(a.EffectiveAt.Compare(b.EffectiveAt), a.CreatedAt.Compare(b.CreatedAt),
			strings.Compare(a.ID, b.ID))
	})

	for _, trade := range ordered {
		item := DuplicateTrade{Transaction: trade, SharedLines: make([]bool, len(trade.Items))}

		for i, line := range trade.Items {
			key := tstore.LineKey(line)

			for _, other := range trades {
				if other.ID != trade.ID && slices.Contains(keys[other.ID], key) {
					item.SharedLines[i] = true
				}
			}
		}

		// The suggested original is offered first, then the others in the same order.
		for _, other := range byOriginal {
			if other.ID == trade.ID {
				continue
			}

			if slices.Equal(keys[trade.ID], keys[other.ID]) {
				item.ExactCopy = true
			}

			if item.ContainedIn == "" && trade.Type == "c2b" &&
				tstore.ContainedIn(keys[trade.ID], keys[other.ID]) {
				item.ContainedIn = other.ID
			}
		}

		group.Trades = append(group.Trades, item)
	}

	return group
}

// DeleteDuplicate deletes a confirmed copy of another collection for good.
// Everything happens in one transaction; stored files go only after it commits.
func (s *Service) DeleteDuplicate(ctx context.Context, user auth.User, id, original string) error {
	if err := requireAdmin(user); err != nil {
		return err
	}

	if id == original {
		return apperr.BadRequest("Choose a different trade as the original.", nil)
	}

	return s.db.InTx(database.WithActor(ctx, user.ID), func(ctx context.Context) error {
		if err := s.store.LockDuplicateTrades(ctx, []string{id, original}); err != nil {
			return err
		}

		trade, err := s.duplicateTrade(ctx, id)
		if err != nil {
			return err
		}

		source, err := s.duplicateTrade(ctx, original)
		if err != nil {
			return err
		}

		if trade.Type != "c2b" {
			return apperr.BadRequest("Business trades cannot be deleted as duplicates here.", nil)
		}

		if trade.Status != "complete" || source.Status != "complete" ||
			trade.Type != source.Type || trade.Buyer.ID != source.Buyer.ID ||
			trade.Seller.ID != source.Seller.ID {
			return apperr.Conflict("These two trades no longer match. Refresh the page.")
		}

		if !tstore.ContainedIn(tstore.LineKeys(trade.Items), tstore.LineKeys(source.Items)) {
			return apperr.Conflict(
				"This trade has lines the other one doesn't, so it can't be deleted as a copy of it.")
		}

		if copies, err := s.store.HasDuplicateCopies(ctx, id); err != nil {
			return err
		} else if copies {
			return apperr.Conflict("Trades marked as copies of this one earlier still point at it.")
		}

		if reviewed, err := s.store.HasReview(ctx, id); err != nil {
			return err
		} else if reviewed {
			return apperr.Conflict("Someone left a review on this trade, so it can't be deleted.")
		}

		// Follow normal trades' material lock order. Take writes fresh audit entries.
		items := slices.Clone(trade.Items)
		slices.SortFunc(items, func(a, b tstore.Item) int {
			return strings.Compare(a.MaterialID, b.MaterialID)
		})

		stock := map[string]string{}

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
				return apperr.Conflict("This stock has already been used, so this copy can't be deleted.")
			}

			stock[item.MaterialName+" ("+item.MaterialID+")"] = item.Weight
		}

		keys, err := s.store.DeleteCopy(ctx, user.ID, id, original, stock)
		if err != nil {
			return err
		}

		for _, key := range keys {
			s.objects.RemoveAfterCommit(ctx, key)
		}

		return nil
	})
}

func (s *Service) duplicateTrade(ctx context.Context, id string) (tstore.Transaction, error) {
	trade, err := s.trades.Get(ctx, id)
	if errors.Is(err, tstore.ErrNotFound) {
		return trade, apperr.NotFound("Trade not found.")
	}

	return trade, err
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

		groups, err := s.components(ctx)
		if err != nil {
			return err
		}

		if slices.ContainsFunc(groups, func(g []string) bool { return slices.Equal(ids, g) }) {
			return s.store.DismissDuplicates(ctx, ids, user.ID)
		}

		return apperr.Conflict("This group has changed. Refresh it before deciding.")
	})
}
