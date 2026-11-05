package requests

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/notifications"
	store "github.com/connor-davis/3reco/internal/stores/requests"
)

const (
	maxMessageRunes = 2000
	previewRunes    = 60
)

// Messages lists the chat of a request, oldest first. Only its two sides may
// read it; staff may not.
func (s *Service) Messages(
	ctx context.Context,
	user auth.User,
	id, cursor string,
	limit int,
) (paging.Page[store.Message], error) {
	var empty paging.Page[store.Message]

	if _, err := s.load(ctx, user, id, false); err != nil {
		return empty, err
	}

	cur, err := paging.ParseCursor(cursor)
	if err != nil {
		return empty, err
	}

	rows, err := s.store.Messages(ctx, id, cur, limit)
	if err != nil {
		return empty, err
	}

	return paging.Build(rows, limit, func(m store.Message) (time.Time, string) {
		return m.CreatedAt, m.ID
	}), nil
}

// Send adds a chat line from the caller and tells the other side. Only a
// pending request takes messages.
func (s *Service) Send(
	ctx context.Context,
	user auth.User,
	id, content string,
) (store.Message, error) {
	var sent store.Message

	content = strings.TrimSpace(content)
	if content == "" {
		return sent, apperr.Field("content", "Write a message first.")
	}

	if utf8.RuneCountInString(content) > maxMessageRunes {
		return sent, apperr.Field("content", "That message is too long.")
	}

	err := s.db.InTx(ctx, func(ctx context.Context) error {
		r, err := s.load(ctx, user, id, true)
		if err != nil {
			return err
		}

		if r.Status != StatusPending {
			return apperr.Conflict("Cannot send messages on a closed request.")
		}

		sent, err = s.store.InsertMessage(ctx, id, user.ID, content)
		if err != nil {
			return err
		}

		other := r.Seller.ID
		if other == user.ID {
			other = r.Buyer.ID
		}

		return s.notes.Notify(ctx, other, notifications.MessageReceived,
			"New message", preview(content), "/market/"+id)
	})

	return sent, err
}

// preview is the start of a message, cut to fit a bell notification.
func preview(content string) string {
	runes := []rune(content)
	if len(runes) <= previewRunes {
		return content
	}

	return string(runes[:previewRunes-3]) + "…"
}

// MarkRead marks the other side's messages on a request as read by the caller.
func (s *Service) MarkRead(ctx context.Context, user auth.User, id string) error {
	if _, err := s.load(ctx, user, id, false); err != nil {
		return err
	}

	return s.store.MarkRead(ctx, id, user.ID)
}

// Inbox lists the caller's pending requests with the newest message and the
// unread count of each. It only ever reads requests the caller takes part in.
func (s *Service) Inbox(
	ctx context.Context,
	user auth.User,
	cursor string,
	limit int,
) (paging.Page[store.Thread], error) {
	var empty paging.Page[store.Thread]

	cur, err := paging.ParseCursor(cursor)
	if err != nil {
		return empty, err
	}

	rows, err := s.store.Inbox(ctx, user.ID, cur, limit)
	if err != nil {
		return empty, err
	}

	return paging.Build(rows, limit, func(t store.Thread) (time.Time, string) {
		return t.ActivityAt, t.RequestID
	}), nil
}
