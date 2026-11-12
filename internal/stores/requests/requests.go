// Package requests is the database access for buying requests, their offers
// and their chat. SQL only; the state machine lives in services/requests.
package requests

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// ErrNotFound means no request has that id.
var ErrNotFound = errors.New("request not found")

// Item is one material of a request, with the seller's offer once there is
// one. StockID is empty on requests moved over from the old app.
type Item struct {
	MaterialID      string  `json:"material_id"`
	MaterialName    string  `json:"material_name"`
	StockID         *string `json:"stock_id"`
	RequestedWeight *string `json:"requested_weight"`
	RequestedPrice  *string `json:"requested_price"`
	OfferWeight     *string `json:"offer_weight"`
	OfferPrice      *string `json:"offer_price"`
	AvailableWeight *string `json:"available_weight"`
}

// Request is a buying request as its two sides (and staff) see it.
type Request struct {
	TransactionID          *string        `json:"transaction_id"`
	ID                     string         `json:"id"`
	Seller                 database.Party `json:"seller"`
	Buyer                  database.Party `json:"buyer"`
	Status                 string         `json:"status"`
	OfferBy                *string        `json:"offer_by"`
	OfferVersion           int            `json:"offer_version"`
	BuyerConfirmedVersion  *int           `json:"buyer_confirmed_version"`
	SellerConfirmedVersion *int           `json:"seller_confirmed_version"`
	Items                  []Item         `json:"items"`
	CreatedAt              time.Time      `json:"created_at"`
	UpdatedAt              time.Time      `json:"updated_at"`
}

// NewItem is a requested stock row.
type NewItem struct{ MaterialID, StockID, Weight string }

// Store runs the request SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

var selectRequest = `
	SELECT r.id, r.seller_id, ` + database.DisplayName("s") + `, ` + database.Verified("s") + `,
		r.buyer_id, ` + database.DisplayName("b") + `, ` + database.Verified("b") + `,
		r.status, r.created_at, r.updated_at, r.offer_by, r.offer_version,
		r.buyer_confirmed_version, r.seller_confirmed_version,
        (SELECT t.id FROM transactions t WHERE t.request_id=r.id AND t.status='complete' LIMIT 1)
	FROM transaction_requests r
	JOIN users s ON s.id = r.seller_id
	JOIN users b ON b.id = r.buyer_id`

func scan(row pgx.Row) (Request, error) {
	var r Request

	err := row.Scan(
		&r.ID,
		&r.Seller.ID,
		&r.Seller.Name,
		&r.Seller.Verified,
		&r.Buyer.ID,
		&r.Buyer.Name,
		&r.Buyer.Verified,
		&r.Status,
		&r.CreatedAt,
		&r.UpdatedAt,
		&r.OfferBy,
		&r.OfferVersion,
		&r.BuyerConfirmedVersion,
		&r.SellerConfirmedVersion,
		&r.TransactionID,
	)
	r.Items = []Item{}

	return r, err
}

// Insert writes a pending request and its items.
func (s *Store) Insert(ctx context.Context, id, sellerID, buyerID string, items []NewItem) error {
	q := s.db.Q(ctx)

	_, err := q.Exec(ctx, `
		INSERT INTO transaction_requests (id, seller_id, buyer_id, status)
		VALUES ($1, $2, $3, 'pending')`, id, sellerID, buyerID)
	if err != nil {
		return err
	}

	for position, item := range items {
		_, err := q.Exec(
			ctx,
			`INSERT INTO transaction_request_items
			(request_id, position, material_id, stock_id, requested_weight, requested_price)
			SELECT $1, $2, $3, s.id, $5::numeric, s.price FROM stock s WHERE s.id=$4`,
			id,
			position,
			item.MaterialID,
			item.StockID,
			item.Weight,
		)
		if err != nil {
			return err
		}
	}

	return nil
}

// Get returns one request with its items. With lock set it also locks the
// request row until the transaction ends, so two clicks cannot both move it.
func (s *Store) Get(ctx context.Context, id string, lock bool) (Request, error) {
	query := selectRequest + ` WHERE r.id = $1`
	if lock {
		query += ` FOR UPDATE OF r`
	}

	r, err := scan(s.db.Q(ctx).QueryRow(ctx, query, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return r, ErrNotFound
	}

	if err != nil {
		return r, err
	}

	list := []Request{r}
	if err := s.fill(ctx, list); err != nil {
		return r, err
	}

	return list[0], nil
}

// ListIncoming returns up to limit+1 requests made to the seller.
func (s *Store) ListIncoming(
	ctx context.Context,
	sellerID string,
	cur paging.Cursor,
	limit int,
) ([]Request, error) {
	return s.list(ctx, `r.seller_id = $1`, sellerID, cur, limit)
}

// ListOutgoing returns up to limit+1 requests the buyer made.
func (s *Store) ListOutgoing(
	ctx context.Context,
	buyerID string,
	cur paging.Cursor,
	limit int,
) ([]Request, error) {
	return s.list(ctx, `r.buyer_id = $1`, buyerID, cur, limit)
}

func (s *Store) list(
	ctx context.Context,
	clause, userID string,
	cur paging.Cursor,
	limit int,
) ([]Request, error) {
	rows, err := s.db.Q(ctx).Query(ctx, selectRequest+` WHERE `+clause+`
		AND ($2::timestamptz IS NULL OR (r.created_at, r.id) < ($2, $3))
		ORDER BY r.created_at DESC, r.id DESC
		LIMIT $4`, userID, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}

	var out []Request

	for rows.Next() {
		r, err := scan(rows)
		if err != nil {
			rows.Close()

			return nil, err
		}

		out = append(out, r)
	}

	rows.Close()

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return out, s.fill(ctx, out)
}

// fill loads the items of every listed request in one query.
func (s *Store) fill(ctx context.Context, list []Request) error {
	if len(list) == 0 {
		return nil
	}

	ids := make([]string, len(list))
	at := make(map[string]int, len(list))

	for i, r := range list {
		ids[i], at[r.ID] = r.ID, i
	}

	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT i.request_id, i.material_id, m.name, i.stock_id, i.offer_weight::text,
			i.offer_price::text, i.requested_weight::text, i.requested_price::text,
			(SELECT (stock_available(s.id,s.weight)+COALESCE((SELECT sum(h.weight)
				FROM stock_holds h WHERE h.request_id=i.request_id AND h.stock_id=s.id
				AND h.status='active' AND h.expires_at>clock_timestamp()),0))::text
			FROM stock s WHERE s.id=i.stock_id)
		FROM transaction_request_items i JOIN materials m ON m.id = i.material_id
		WHERE i.request_id = ANY($1) ORDER BY i.request_id, i.position`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id string

		var item Item

		err := rows.Scan(&id, &item.MaterialID, &item.MaterialName, &item.StockID,
			&item.OfferWeight, &item.OfferPrice, &item.RequestedWeight, &item.RequestedPrice, &item.AvailableWeight)
		if err != nil {
			return err
		}

		list[at[id]].Items = append(list[at[id]].Items, item)
	}

	return rows.Err()
}

// SetStatus moves a request to a new status.
func (s *Store) SetStatus(ctx context.Context, id, status string) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`UPDATE transaction_requests SET status = $2, updated_at = now() WHERE id = $1`, id, status)

	return err
}

// ClearOffers removes every offered weight and price of a request, so an old
// offer can never leak into a new one.
func (s *Store) ClearOffers(ctx context.Context, id string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE transaction_request_items SET offer_weight = NULL, offer_price = NULL
		WHERE request_id = $1`, id)

	return err
}

// SetOffer writes the offered weight and price for one material of a request.
func (s *Store) SetOffer(ctx context.Context, id, materialID, weight, price string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		UPDATE transaction_request_items
		SET offer_weight = $3::numeric, offer_price = $4::numeric
		WHERE request_id = $1 AND material_id = $2`, id, materialID, weight, price)

	return err
}

// ListedStock returns the material of each given stock row that belongs to
// the seller and is on the market. Rows that are not, are left out.
func (s *Store) ListedStock(
	ctx context.Context,
	sellerID string,
	stockIDs []string,
) (map[string]string, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT id, material_id FROM stock
		WHERE id = ANY($1) AND owner_id = $2 AND is_listed`, stockIDs, sellerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]string{}

	for rows.Next() {
		var id, material string

		if err := rows.Scan(&id, &material); err != nil {
			return nil, err
		}

		out[id] = material
	}

	return out, rows.Err()
}

// ActiveUser reports whether the id belongs to a user who was not removed.
func (s *Store) ActiveUser(ctx context.Context, userID string) (bool, error) {
	var ok bool

	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND NOT is_removed)`, userID).Scan(&ok)

	return ok, err
}
