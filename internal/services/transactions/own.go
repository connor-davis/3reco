package transactions

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
	store "github.com/connor-davis/3reco/internal/stores/transactions"
)

// OwnTrades is the scope and id of the caller's own party: the active business, or
// the collector a collector user is linked to. It never widens for admin or staff, so
// a report built on it only ever covers the caller's own trades. An empty id means
// the caller has no party to report on.
func (s *Service) OwnTrades(ctx context.Context, user auth.User) (store.Scope, string, error) {
	if party := auth.PartyID(user); party != "" {
		return store.ScopeMine, party, nil
	}

	if !auth.HasRole(user, auth.RoleCollector) {
		return "", "", apperr.Forbidden("You are not allowed to see these transactions.")
	}

	collectorID, _, err := s.store.CollectorForUser(ctx, user.ID)

	return store.ScopeCollectorSales, collectorID, err
}

// DayRange turns two inclusive YYYY-MM-DD days into [from, to) bounds at South African
// midnight. A range may not run past one year.
func DayRange(from, to string) (time.Time, time.Time, error) {
	start, err := time.ParseInLocation(time.DateOnly, from, sast)
	if err != nil {
		return start, start, apperr.Field("from", "Use a real date in YYYY-MM-DD format.")
	}

	last, err := time.ParseInLocation(time.DateOnly, to, sast)
	if err != nil {
		return start, start, apperr.Field("to", "Use a real date in YYYY-MM-DD format.")
	}

	// The end day counts whole, so the bound is the start of the next one.
	end := last.AddDate(0, 0, 1)
	if !end.After(start) {
		return start, end, apperr.Field("to", "The end date cannot be before the start date.")
	}

	if end.After(start.AddDate(1, 0, 0)) {
		return start, end, apperr.Field("to", "Choose a range of one year or less.")
	}

	return start, end, nil
}

// DayLabel prints a moment as its South African day, like "5 March 2026".
func DayLabel(moment time.Time) string {
	return moment.In(sast).Format("2 January 2006")
}
