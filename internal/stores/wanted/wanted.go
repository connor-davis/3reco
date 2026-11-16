// Package wanted is the database access for wanted posts: what a buyer wants,
// and what sellers may see of it. SQL only; the rules live in services/wanted.
package wanted

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// ErrNotFound means no post has that id.
var ErrNotFound = errors.New("wanted post not found")

// Post is a wanted post as the web sees it. The buyer is never in it: sellers
// learn only the material, weight, price ceiling, rough area and expiry.
type Post struct {
	ID           string    `json:"id"`
	MaterialID   string    `json:"material_id"`
	MaterialName string    `json:"material_name"`
	Weight       string    `json:"weight"`
	MaxPrice     *string   `json:"max_price"`
	Area         string    `json:"area"`
	Status       string    `json:"status"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
	// ReplyCount is set on the buyer's own list: replies still alive or won.
	ReplyCount int `json:"reply_count"`
	// MyRequestID is set on discovery: the caller's reply, if they made one.
	MyRequestID *string `json:"my_request_id"`
	// BuyerID is for the rules only and is never sent.
	BuyerID string `json:"-"`
}

// Reply is one seller's answer to a post, as the buyer sees it.
type Reply struct {
	RequestID string         `json:"request_id"`
	Seller    database.Party `json:"seller"`
	Status    string         `json:"status"`
	CreatedAt time.Time      `json:"created_at"`
}

// NewPost is a post to write.
type NewPost struct {
	ID, BuyerID, MaterialID, Weight, Area string
	MaxPrice                              *string
	Days                                  int
}

// Store runs the wanted post SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

const selectPost = `
	SELECT p.id, p.buyer_id, p.material_id, m.name, p.weight::text, p.max_price::text, p.area,
		CASE WHEN p.status='open' AND p.expires_at<=now() THEN 'expired' ELSE p.status END,
		p.expires_at, p.created_at`

const fromPost = `
	FROM wanted_posts p
	JOIN materials m ON m.id = p.material_id
	JOIN businesses b ON b.id = p.buyer_id`

func scan(row pgx.Row, extra ...any) (Post, error) {
	var p Post

	dest := []any{
		&p.ID, &p.BuyerID, &p.MaterialID, &p.MaterialName, &p.Weight, &p.MaxPrice, &p.Area,
		&p.Status, &p.ExpiresAt, &p.CreatedAt,
	}

	return p, row.Scan(append(dest, extra...)...)
}

// Insert writes an open post. It reports false when the material does not exist.
func (s *Store) Insert(ctx context.Context, p NewPost) (bool, error) {
	tag, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO wanted_posts (id, buyer_id, material_id, weight, max_price, area, expires_at)
		SELECT $1, $2, m.id, $4::numeric, $5::numeric, $6, now() + make_interval(days => $7::int)
		FROM materials m WHERE m.id = $3`,
		p.ID, p.BuyerID, p.MaterialID, p.Weight, p.MaxPrice, p.Area, p.Days)

	return tag.RowsAffected() == 1, err
}

// Get returns one post. With lock set it also locks the row until the
// transaction ends, so a reply, a close and an accept take turns.
func (s *Store) Get(ctx context.Context, id string, lock bool) (Post, error) {
	query := selectPost + fromPost + ` WHERE p.id = $1`
	if lock {
		query += ` FOR UPDATE OF p`
	}

	p, err := scan(s.db.Q(ctx).QueryRow(ctx, query, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}

	return p, err
}

// Discover returns up to limit+1 open, unexpired posts of other businesses,
// newest first, optionally for one material. A removed buyer's posts are gone.
func (s *Store) Discover(
	ctx context.Context,
	callerID, materialID string,
	cur paging.Cursor,
	limit int,
) ([]Post, error) {
	rows, err := s.db.Q(ctx).Query(ctx, selectPost+`,
		(SELECT r.id FROM transaction_requests r
			WHERE r.wanted_post_id = p.id AND r.seller_id = $1)`+fromPost+`
		WHERE p.status = 'open' AND p.expires_at > now() AND NOT b.is_removed
			AND p.buyer_id <> $1 AND ($2 = '' OR p.material_id = $2)
			AND ($3::timestamptz IS NULL OR (p.created_at, p.id) < ($3, $4))
		ORDER BY p.created_at DESC, p.id DESC LIMIT $5`,
		callerID, materialID, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Post

	for rows.Next() {
		var mine *string

		p, err := scan(rows, &mine)
		if err != nil {
			return nil, err
		}

		p.MyRequestID = mine
		out = append(out, p)
	}

	return out, rows.Err()
}

// Mine returns up to limit+1 posts of the buyer in any state, newest first,
// each with its count of replies still alive or won.
func (s *Store) Mine(
	ctx context.Context,
	buyerID string,
	cur paging.Cursor,
	limit int,
) ([]Post, error) {
	rows, err := s.db.Q(ctx).Query(ctx, selectPost+`,
		(SELECT count(*) FROM transaction_requests r WHERE r.wanted_post_id = p.id
			AND r.status IN ('pending','offered','accepted'))`+fromPost+`
		WHERE p.buyer_id = $1
			AND ($2::timestamptz IS NULL OR (p.created_at, p.id) < ($2, $3))
		ORDER BY p.created_at DESC, p.id DESC LIMIT $4`,
		buyerID, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Post

	for rows.Next() {
		var count int

		p, err := scan(rows, &count)
		if err != nil {
			return nil, err
		}

		p.ReplyCount = count
		out = append(out, p)
	}

	return out, rows.Err()
}

// Replies lists the replies to a post, oldest first.
func (s *Store) Replies(ctx context.Context, postID string) ([]Reply, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT r.id, r.seller_id, `+database.DisplayName("s")+`, `+database.Verified("s")+`,
			r.status, r.created_at
		FROM transaction_requests r JOIN business_profiles s ON s.id = r.seller_id
		WHERE r.wanted_post_id = $1 ORDER BY r.created_at, r.id`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Reply{}

	for rows.Next() {
		var reply Reply

		err := rows.Scan(&reply.RequestID, &reply.Seller.ID, &reply.Seller.Name,
			&reply.Seller.Verified, &reply.Status, &reply.CreatedAt)
		if err != nil {
			return nil, err
		}

		out = append(out, reply)
	}

	return out, rows.Err()
}

// SetStatus moves a locked post to filled or closed.
func (s *Store) SetStatus(ctx context.Context, id, status string) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`UPDATE wanted_posts SET status = $2, updated_at = now() WHERE id = $1`, id, status)

	return err
}

// HasReply reports whether the seller already answered the post.
func (s *Store) HasReply(ctx context.Context, postID, sellerID string) (bool, error) {
	var found bool

	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM transaction_requests
			WHERE wanted_post_id = $1 AND seller_id = $2)`, postID, sellerID).Scan(&found)

	return found, err
}

// BuyerActive reports whether the business behind a post is still active.
func (s *Store) BuyerActive(ctx context.Context, buyerID string) (bool, error) {
	var ok bool

	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM businesses WHERE id = $1 AND NOT is_removed)`, buyerID).Scan(&ok)

	return ok, err
}
