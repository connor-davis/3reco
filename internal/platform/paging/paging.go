// Package paging is the one list shape every route shares: a page of items, a
// cursor for the next page, and a flag that says whether there is more.
// Cursors are keysets over (time, id), so a page never skips or repeats a row
// when new rows arrive.
package paging

import (
	"encoding/base64"
	"strconv"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
)

// Page sizes: what a list returns when the caller says nothing, and the most
// it will ever return.
const (
	DefaultLimit = 20
	MaxLimit     = 100
)

// Page is the answer of every paginated route.
type Page[T any] struct {
	Items      []T     `json:"items"`
	NextCursor *string `json:"next_cursor"`
	HasMore    bool    `json:"has_more"`
}

// Cursor is a position in a list ordered by (time, id). The zero Cursor means
// "from the start"; At stays nil so SQL can test it for NULL.
type Cursor struct {
	At *time.Time
	ID string
}

// Query combines a cursor and page size, including the owner-scoped all mode.
type Query struct {
	Cursor
	Limit int
	All   bool
}

// Parse applies the shared cursor and limit rules to a list request.
func Parse(raw, limit string, all bool) (Query, error) {
	cursor, err := ParseCursor(raw)
	if err != nil {
		return Query{}, err
	}

	return Query{Cursor: cursor, Limit: Limit(limit), All: all}, nil
}

// Size includes a lookahead row, or zero for SQL LIMIT NULLIF(size, 0).
func (query Query) Size() int {
	if query.All {
		return 0
	}

	return query.Limit + 1
}

// ParseCursor reads a cursor the API handed out earlier. Empty means the start.
func ParseCursor(raw string) (Cursor, error) {
	if raw == "" {
		return Cursor{}, nil
	}

	bad := apperr.BadRequest("The page cursor is not valid.", nil)

	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return Cursor{}, bad
	}

	stamp, id, found := strings.Cut(string(decoded), "|")
	if !found || id == "" {
		return Cursor{}, bad
	}

	at, err := time.Parse(time.RFC3339Nano, stamp)
	if err != nil {
		return Cursor{}, bad
	}

	return Cursor{At: &at, ID: id}, nil
}

// Limit reads the "limit" query value, falling back to DefaultLimit and never
// going past MaxLimit.
func Limit(raw string) int {
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return DefaultLimit
	}

	return min(n, MaxLimit)
}

// Build turns up to limit+1 fetched rows into a page: the extra row only says
// that more exist. key gives the (time, id) a row sorts by.
func Build[T any](rows []T, limit int, key func(T) (time.Time, string)) Page[T] {
	page := Page[T]{Items: rows}

	if len(rows) > limit {
		page.Items = rows[:limit]
		page.HasMore = true

		at, id := key(page.Items[limit-1])
		next := base64.RawURLEncoding.EncodeToString([]byte(at.UTC().Format(time.RFC3339Nano) + "|" + id))
		page.NextCursor = &next
	}

	if page.Items == nil {
		page.Items = []T{}
	}

	return page
}
