package transactions

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	store "github.com/connor-davis/3reco/internal/stores/transactions"
)

// ListFilter is the raw search a list request carries: text, a trade type and
// an inclusive YYYY-MM-DD day range in South African time.
type ListFilter struct {
	Q, Type, From, To, Status string
}

// sast is South African time; it has no daylight saving.
var sast = time.FixedZone("SAST", 2*60*60)

// parse checks the type and the days, so a bad value is a 400.
func (f ListFilter) parse() (store.Filter, error) {
	out := store.Filter{Like: paging.SearchPattern(f.Q), Type: f.Type, Status: f.Status}

	if f.Status != "" && f.Status != "complete" && f.Status != "pending" {
		return out, apperr.BadRequest("Use complete or pending for status.", nil)
	}

	if f.Type != "" && f.Type != "b2b" && f.Type != "c2b" {
		return out, apperr.BadRequest("Use b2b or c2b for type.", nil)
	}

	if f.From != "" {
		day, err := time.ParseInLocation(time.DateOnly, f.From, sast)
		if err != nil {
			return out, apperr.BadRequest("Use a date like 2026-01-31 for from.", nil)
		}

		out.From = &day
	}

	if f.To != "" {
		day, err := time.ParseInLocation(time.DateOnly, f.To, sast)
		if err != nil {
			return out, apperr.BadRequest("Use a date like 2026-01-31 for to.", nil)
		}

		// To counts the whole day, so the bound is the start of the next one.
		end := day.AddDate(0, 0, 1)
		out.To = &end
	}

	return out, nil
}

// Totals counts and sums every transaction the caller's list holds under the
// same filters, so a stats card describes the whole set and not one page.
func (s *Service) Totals(
	ctx context.Context,
	user auth.User,
	kind string,
	in ListFilter,
) (store.Totals, error) {
	filter, err := in.parse()
	if err != nil {
		return store.Totals{}, err
	}

	scope, owner, err := s.scope(ctx, user, kind)
	if err != nil {
		return store.Totals{}, err
	}

	// A collector with no linked collector row has sold nothing.
	if owner == "" {
		return store.Totals{Weight: "0", Value: "0"}, nil
	}

	return s.store.Totals(ctx, scope, owner, filter)
}
