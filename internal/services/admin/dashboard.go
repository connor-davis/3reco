package admin

import (
	"context"
	"math/big"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
	store "github.com/connor-davis/3reco/internal/stores/admin"
)

// maxRangeDays keeps one dashboard call from building a huge series.
const maxRangeDays = 366

// sast is South Africa's zone. It has no daylight saving, so a fixed offset is
// exactly right and needs no zone database on the server.
var sast = time.FixedZone("SAST", 2*60*60)

// Totals add up the series.
type Totals struct {
	Count  int    `json:"count"`
	Value  string `json:"value"`
	Weight string `json:"weight"`
	Carbon string `json:"carbon_savings"`
}

// Dashboard is what every dashboard returns; the admin one also has the user
// counts.
type Dashboard struct {
	From           string               `json:"from"`
	To             string               `json:"to"`
	Totals         Totals               `json:"totals"`
	Series         []store.Day          `json:"series"`
	Counterparties []store.Counterparty `json:"counterparties"`
	Users          []store.RoleCount    `json:"users,omitempty"`
	ByType         []store.TypeTotal    `json:"by_type,omitempty"`
	CollectorLink  *bool                `json:"collector_linked,omitempty"`
}

// parseBound reads a YYYY-MM-DD day (the start of that South African day) or a
// full RFC3339 time.
func parseBound(raw string) (time.Time, bool, error) {
	if t, err := time.ParseInLocation(time.DateOnly, raw, sast); err == nil {
		return t, true, nil
	}

	t, err := time.Parse(time.RFC3339, raw)

	return t, false, err
}

// window turns the from and to query values into [start, end). A date-only
// "to" includes that whole day. The default is the last 30 days.
func window(rawFrom, rawTo string, now time.Time) (time.Time, time.Time, error) {
	bad := apperr.BadRequest("Use YYYY-MM-DD or an RFC3339 time for from and to.", nil)

	y, m, d := now.In(sast).Date()
	today := time.Date(y, m, d, 0, 0, 0, 0, sast)

	start, end := today.AddDate(0, 0, -29), today.AddDate(0, 0, 1)

	if rawFrom != "" {
		t, _, err := parseBound(rawFrom)
		if err != nil {
			return start, end, bad
		}

		start = t
	}

	if rawTo != "" {
		t, dateOnly, err := parseBound(rawTo)
		if err != nil {
			return start, end, bad
		}

		end = t
		if dateOnly {
			end = t.AddDate(0, 0, 1)
		}
	}

	if !end.After(start) {
		return start, end, apperr.BadRequest("The end must be after the start.", nil)
	}

	if end.Sub(start) > maxRangeDays*24*time.Hour {
		return start, end, apperr.BadRequest("Pick a range of at most 366 days.", nil)
	}

	return start, end, nil
}

// Admin is the all-trades dashboard for admin and staff.
func (s *Service) Admin(
	ctx context.Context,
	user auth.User,
	from, to string,
) (Dashboard, error) {
	if !auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff) {
		return Dashboard{}, apperr.Forbidden("Only admin or staff can see this.")
	}

	d, err := s.build(ctx, store.ScopeEverything, "", from, to)
	if err != nil {
		return d, err
	}

	d.Users, err = s.store.RoleCounts(ctx)
	if err != nil {
		return d, err
	}

	// The same window as the totals, split into collections and business sales.
	start, end, err := window(from, to, time.Now())
	if err != nil {
		return d, err
	}

	d.ByType, err = s.store.TypeTotals(ctx, start, end)

	return d, err
}

// Business is a business's own dashboard: what it bought and sold.
func (s *Service) Business(
	ctx context.Context,
	user auth.User,
	from, to string,
) (Dashboard, error) {
	if !auth.HasRole(user, auth.RoleBusiness) {
		return Dashboard{}, apperr.Forbidden("Only a business can see this.")
	}

	return s.build(ctx, store.ScopeBusiness, user.ID, from, to)
}

// Collector is a collector's own dashboard. A collector with no linked
// collector row sees zeros.
func (s *Service) Collector(
	ctx context.Context,
	user auth.User,
	from, to string,
) (Dashboard, error) {
	if !auth.HasRole(user, auth.RoleCollector) {
		return Dashboard{}, apperr.Forbidden("Only a collector can see this.")
	}

	collectorID, linked, err := s.trades.CollectorForUser(ctx, user.ID)
	if err != nil {
		return Dashboard{}, err
	}

	// An empty id matches no collector row, so the numbers come back as zeros.
	d, err := s.build(ctx, store.ScopeCollector, collectorID, from, to)
	d.CollectorLink = &linked

	return d, err
}

func (s *Service) build(
	ctx context.Context,
	scope store.Scope,
	owner, rawFrom, rawTo string,
) (Dashboard, error) {
	start, end, err := window(rawFrom, rawTo, time.Now())
	if err != nil {
		return Dashboard{}, err
	}

	days, err := s.store.Days(ctx, scope, owner, start, end)
	if err != nil {
		return Dashboard{}, err
	}

	cps, err := s.store.Counterparties(ctx, scope, owner, start, end)
	if err != nil {
		return Dashboard{}, err
	}

	series, totals := fill(days, start, end)

	return Dashboard{
		From:           start.In(sast).Format(time.RFC3339),
		To:             end.In(sast).Format(time.RFC3339),
		Totals:         totals,
		Series:         series,
		Counterparties: cps,
	}, nil
}

// fill gives every South African day in [start, end) a row, zero when there
// were no trades, and adds up the totals exactly.
func fill(days []store.Day, start, end time.Time) ([]store.Day, Totals) {
	byDay := map[string]store.Day{}
	for _, d := range days {
		byDay[d.Day] = d
	}

	var count int

	value, weight, carbon := new(big.Rat), new(big.Rat), new(big.Rat)
	series := []store.Day{}

	first := start.In(sast)
	cursor := time.Date(first.Year(), first.Month(), first.Day(), 0, 0, 0, 0, sast)

	for ; cursor.Before(end); cursor = cursor.AddDate(0, 0, 1) {
		key := cursor.Format(time.DateOnly)

		d, ok := byDay[key]
		if !ok {
			d = store.Day{Day: key, Value: "0", Weight: "0", Carbon: "0"}
		}

		series = append(series, d)
		count += d.Count

		add(value, d.Value)
		add(weight, d.Weight)
		add(carbon, d.Carbon)
	}

	return series, Totals{
		Count:  count,
		Value:  value.FloatString(2),
		Weight: weight.FloatString(3),
		Carbon: exact(carbon),
	}
}

// exact writes a sum with up to five decimals (weight 3 dp times factor 2 dp)
// and no trailing zeros, so a small carbon total is not rounded to nothing.
func exact(n *big.Rat) string {
	text := n.FloatString(5)
	text = strings.TrimRight(text, "0")

	return strings.TrimSuffix(text, ".")
}

func add(sum *big.Rat, text string) {
	if n, ok := new(big.Rat).SetString(text); ok {
		sum.Add(sum, n)
	}
}
