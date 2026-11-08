// Package notifications holds the rules for the bell: who may touch which
// message, and the one call other areas use to tell someone something.
package notifications

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	store "github.com/connor-davis/3reco/internal/stores/notifications"
)

// Service is the notification rules.
type Service struct{ store *store.Store }

// New builds the service.
func New(s *store.Store) *Service { return &Service{store: s} }

// The message types the database accepts.
const (
	RequestReceived  = "request_received"
	RequestAccepted  = "request_accepted"
	RequestRejected  = "request_rejected"
	RequestCancelled = "request_cancelled"
	MessageReceived  = "message_received"
	StockListed      = "stock_listed"
	StockUnlisted    = "stock_unlisted"
)

// Notify tells one user something. Call it in the same transaction as the
// change it reports, so both happen or neither does.
func (s *Service) Notify(ctx context.Context, userID, kind, title, body, link string) error {
	return s.store.Insert(ctx, userID, kind, title, body, link)
}

// OffersEnded marks a request's offer messages read, in the same transaction
// as the change that ended the offer but not the request.
func (s *Service) OffersEnded(ctx context.Context, requestID string) error {
	return s.store.MarkOffersRead(ctx, "/market/"+requestID)
}

// RequestEnded deletes the prompts of a request that completed, was rejected,
// cancelled or erased. Call it before adding the outcome notice, in the same
// transaction. The delete fires the realtime trigger, so an open bell updates.
func (s *Service) RequestEnded(ctx context.Context, requestID string) error {
	return s.store.DeleteRequestActions(ctx, "/market/"+requestID)
}

// List returns one page of the caller's messages.
func (s *Service) List(
	ctx context.Context,
	userID, cursor string,
	limit int,
) (paging.Page[store.Notification], error) {
	cur, err := paging.ParseCursor(cursor)
	if err != nil {
		return paging.Page[store.Notification]{}, err
	}

	rows, err := s.store.List(ctx, userID, cur, limit)
	if err != nil {
		return paging.Page[store.Notification]{}, err
	}

	return paging.Build(rows, limit, func(n store.Notification) (time.Time, string) {
		return n.CreatedAt, n.ID
	}), nil
}

// UnreadCount counts the caller's unread messages.
func (s *Service) UnreadCount(ctx context.Context, userID string) (int, error) {
	return s.store.UnreadCount(ctx, userID)
}

var errMissing = apperr.NotFound("Notification not found.")

// MarkRead marks one of the caller's messages read; someone else's is a 404.
func (s *Service) MarkRead(ctx context.Context, userID, id string) error {
	found, err := s.store.MarkRead(ctx, userID, id)
	if err != nil {
		return err
	}

	if !found {
		return errMissing
	}

	return nil
}

// MarkAllRead marks all of the caller's messages read.
func (s *Service) MarkAllRead(ctx context.Context, userID string) error {
	return s.store.MarkAllRead(ctx, userID)
}

// Dismiss hides one of the caller's messages; someone else's is a 404.
func (s *Service) Dismiss(ctx context.Context, userID, id string) error {
	found, err := s.store.Dismiss(ctx, userID, id)
	if err != nil {
		return err
	}

	if !found {
		return errMissing
	}

	return nil
}

// DismissAll hides all of the caller's messages.
func (s *Service) DismissAll(ctx context.Context, userID string) error {
	return s.store.DismissAll(ctx, userID)
}
