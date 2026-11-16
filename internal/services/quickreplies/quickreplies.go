// Package quickreplies validates a person's saved chat replies.
package quickreplies

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	store "github.com/connor-davis/3reco/internal/stores/quickreplies"
)

const (
	// MaxReplies is how many replies one person can keep.
	MaxReplies = 20
	// MaxLength is the longest reply, in characters.
	MaxLength = 500
)

// Service owns quick reply rules and caller scope.
type Service struct{ store *store.Store }

// New builds the service.
func New(rows *store.Store) *Service { return &Service{store: rows} }

// Input is the text of one reply.
type Input struct {
	Body string `json:"body"`
}

// clean trims the text and refuses an empty or too long reply.
func clean(body string) (string, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return "", apperr.Field("body", "Write the reply first.")
	}

	if utf8.RuneCountInString(body) > MaxLength {
		return "", apperr.Field("body", "Keep a reply under 500 characters.")
	}

	return body, nil
}

// List reads the caller's own replies.
func (s *Service) List(ctx context.Context, userID string) ([]store.Reply, error) {
	return s.store.List(ctx, userID)
}

// Create saves a reply as the calling person, up to the limit.
func (s *Service) Create(ctx context.Context, userID string, in Input) (string, error) {
	body, err := clean(in.Body)
	if err != nil {
		return "", err
	}

	id := database.NewID()
	saved, err := s.store.Create(ctx, userID, id, body, MaxReplies)
	if err == nil && !saved {
		return "", apperr.Conflict("You can keep up to 20 quick replies. Delete one first.")
	}

	return id, err
}

// Update rewrites one of the caller's own replies. Other people's ids are not found.
func (s *Service) Update(ctx context.Context, userID, id string, in Input) error {
	body, err := clean(in.Body)
	if err != nil {
		return err
	}

	found, err := s.store.Update(ctx, userID, id, body)
	if err == nil && !found {
		return apperr.NotFound("No such quick reply.")
	}

	return err
}

// Delete removes one of the caller's own replies. Other people's ids are not found.
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	found, err := s.store.Delete(ctx, userID, id)
	if err == nil && !found {
		return apperr.NotFound("No such quick reply.")
	}

	return err
}
