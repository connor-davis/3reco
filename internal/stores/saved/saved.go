// Package saved is the SQL that lines up a person's saved listings, saved
// searches and followed stores in one newest-first list. It only reads ids and
// times; the rows themselves come from the stores that own them.
package saved

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Kinds a saved row can be.
const (
	KindListing = "listing"
	KindSearch  = "search"
	KindStore   = "store"
)

// Key points at one saved row: what it is, its id and when it was saved.
type Key struct {
	Kind    string
	ID      string
	SavedAt time.Time
}

// Counts is how many saved rows of each kind a person can see.
type Counts struct {
	Listing int `json:"listing"`
	Search  int `json:"search"`
	Store   int `json:"store"`
}

// Store runs the saved-list SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// visible is the person's saved rows that they may still see. A listing or
// store that is hidden, removed, unverified or blocked is left out, the same
// as in the favourites and follows lists. $1 is the person, $2 their party.
var visible = `
	SELECT 'listing' AS kind, f.stock_id AS id, f.created_at AS at
	FROM favourites f
	JOIN stock s ON s.id=f.stock_id
	JOIN business_profiles u ON u.id=s.owner_id
	WHERE f.user_id=$1 AND s.is_listed AND s.weight>0
	AND NOT u.is_removed AND u.role='business'
	AND (` + database.Verified("u") + ` OR u.id=$2) AND contact_allowed($2,u.id)
	UNION ALL
	SELECT 'search', ss.id, ss.created_at FROM saved_searches ss WHERE ss.user_id=$1
	UNION ALL
	SELECT 'store', u.id, fo.created_at
	FROM follows fo
	JOIN business_profiles u ON u.id=fo.store_id
	WHERE fo.user_id=$1 AND u.role='business' AND NOT u.is_removed
	AND ` + database.Verified("u") + ` AND person_contact_allowed($1,u.id)`

// Keys lists the person's saved rows, newest first. kind is "all" or one
// kind. The cursor id is "kind:id", so rows saved at the same instant keep a
// fixed order and a page never repeats or skips one.
func (s *Store) Keys(
	ctx context.Context,
	userID, partyID, kind string,
	query paging.Query,
) ([]Key, error) {
	rows, err := s.db.Q(ctx).Query(
		ctx,
		`WITH saved AS (`+visible+`)
		SELECT kind, id, at FROM saved
		WHERE ($3='all' OR kind=$3)
		AND ($4='' OR (at, kind||':'||id) < ($5, $4))
		ORDER BY at DESC, kind||':'||id DESC LIMIT NULLIF($6,0)`,
		userID,
		partyID,
		kind,
		query.ID,
		query.At,
		query.Size(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := []Key{}
	for rows.Next() {
		var key Key
		if err := rows.Scan(&key.Kind, &key.ID, &key.SavedAt); err != nil {
			return nil, err
		}

		keys = append(keys, key)
	}

	return keys, rows.Err()
}

// Count totals the person's visible saved rows by kind, for the filter chips.
func (s *Store) Count(ctx context.Context, userID, partyID string) (Counts, error) {
	var counts Counts

	err := s.db.Q(ctx).QueryRow(
		ctx,
		`WITH saved AS (`+visible+`)
		SELECT count(*) FILTER (WHERE kind='listing'),
			count(*) FILTER (WHERE kind='search'),
			count(*) FILTER (WHERE kind='store')
		FROM saved`,
		userID,
		partyID,
	).Scan(&counts.Listing, &counts.Search, &counts.Store)

	return counts, err
}
