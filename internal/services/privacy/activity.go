package privacy

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	store "github.com/connor-davis/3reco/internal/stores/privacy"
)

// ActivityQuery is what the admin asked the activity feed for.
type ActivityQuery struct {
	Cursor, Limit        string
	Actor, Table, Action string
	From, To, Search     string
}

// Activity lists the activity feed: data changes and privacy events together.
// Only an admin may read it.
func (s *Service) Activity(
	ctx context.Context,
	user auth.User,
	query ActivityQuery,
) (paging.Page[store.Activity], error) {
	var empty paging.Page[store.Activity]

	if !auth.HasRole(user, auth.RoleAdmin) {
		return empty, apperr.Forbidden("Only an admin can do this.")
	}

	cur, err := paging.ParseCursor(query.Cursor)
	if err != nil {
		return empty, err
	}

	for field, day := range map[string]string{"from": query.From, "to": query.To} {
		if _, err := time.Parse(time.DateOnly, day); day != "" && err != nil {
			return empty, apperr.Field(field, "Use a date like 2026-11-30.")
		}
	}

	filter := store.ActivityFilter{
		Actor: query.Actor, Table: query.Table, Action: query.Action,
		From: query.From, To: query.To, Like: paging.SearchPattern(query.Search),
	}
	limit := paging.Limit(query.Limit)

	rows, err := s.store.Activity(ctx, cur, filter, limit)
	if err != nil {
		return empty, err
	}

	return paging.Build(rows, limit, func(line store.Activity) (time.Time, string) {
		return line.At, line.ID
	}), nil
}
