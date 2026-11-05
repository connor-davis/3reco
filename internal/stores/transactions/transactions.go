// Package transactions is the database access for finished trades: the
// transaction rows, their items and receipts, and the stock they move. SQL
// only; the rules live in services/transactions.
package transactions

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// ErrNotFound means no transaction has that id.
var ErrNotFound = errors.New("transaction not found")

// Item is one material line of a transaction. Weight and price are exact
// decimal strings.
type Item struct {
	MaterialID   string `json:"material_id"`
	MaterialName string `json:"material_name"`
	Weight       string `json:"weight"`
	Price        string `json:"price"`
}

// Receipt is the public side of a stored receipt photo. The storage key and
// checksum stay on the server.
type Receipt struct {
	ID          string    `json:"id"`
	FileName    string    `json:"file_name"`
	ContentType string    `json:"content_type"`
	Size        int64     `json:"size"`
	UploadedAt  time.Time `json:"uploaded_at"`
}

// Transaction is a trade as its participants see it. It never holds the
// collector snapshot, the invoice key or the upload slots.
type Transaction struct {
	ID             string         `json:"id"`
	Type           string         `json:"type"`
	Seller         database.Party `json:"seller"`
	Buyer          database.Party `json:"buyer"`
	TotalPrice     string         `json:"total_price"`
	CollectionDay  *string        `json:"collection_day"`
	CollectionDate *time.Time     `json:"collection_date"`
	EffectiveAt    time.Time      `json:"effective_at"`
	CreatedAt      time.Time      `json:"created_at"`
	InvoiceNumber  string         `json:"invoice_number"`
	Items          []Item         `json:"items"`
	Receipts       []Receipt      `json:"receipts"`
}

// Scope says which rows a list may return. Each one is a fixed SQL clause on
// $1, so nothing a caller sends ever becomes SQL.
type Scope string

// The ways a list can be cut. $1 is the caller's id, except for
// ScopeCollectorSales where it is the caller's linked collector id.
const (
	ScopeAll            Scope = "all"
	ScopePurchases      Scope = "purchases"
	ScopeBusinessSales  Scope = "business_sales"
	ScopeCollectorSales Scope = "collector_sales"
	ScopeMine           Scope = "mine"
)

var scopeSQL = map[Scope]string{
	ScopeAll:            "$1::text IS NOT NULL",
	ScopePurchases:      "t.buyer_id = $1",
	ScopeBusinessSales:  "t.seller_id = $1 AND t.type = 'b2b'",
	ScopeCollectorSales: "t.seller_id = $1 AND t.type = 'c2b'",
	ScopeMine:           "(t.buyer_id = $1 OR (t.type = 'b2b' AND t.seller_id = $1))",
}

// Store runs the transaction SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

var selectTransaction = `
	SELECT t.id, t.type, t.seller_id,
		COALESCE(c.name, ` + database.DisplayName("s") + `), t.buyer_id, ` + database.DisplayName("b") + `,
		t.total_price::text, t.collection_day::text, t.collection_date,
		` + database.EffectiveDate("t") + `, t.created_at
	FROM transactions t
	JOIN users b ON b.id = t.buyer_id
	LEFT JOIN users s ON t.type = 'b2b' AND s.id = t.seller_id
	LEFT JOIN collectors c ON t.type = 'c2b' AND c.id = t.seller_id`

func scan(row pgx.Row) (Transaction, error) {
	var t Transaction

	err := row.Scan(&t.ID, &t.Type, &t.Seller.ID, &t.Seller.Name, &t.Buyer.ID, &t.Buyer.Name,
		&t.TotalPrice, &t.CollectionDay, &t.CollectionDate, &t.EffectiveAt, &t.CreatedAt)
	if err != nil {
		return t, err
	}

	// Not sequential on purpose: the last 8 characters of the id, in capitals.
	t.InvoiceNumber = strings.ToUpper(t.ID[max(0, len(t.ID)-8):])
	t.Items, t.Receipts = []Item{}, []Receipt{}

	return t, nil
}

// Get returns one transaction with its items and receipts.
func (s *Store) Get(ctx context.Context, id string) (Transaction, error) {
	t, err := scan(s.db.Q(ctx).QueryRow(ctx, selectTransaction+` WHERE t.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}

	if err != nil {
		return t, err
	}

	list := []Transaction{t}
	if err := s.fill(ctx, list); err != nil {
		return t, err
	}

	return list[0], nil
}

// List returns up to limit+1 transactions in scope, newest first, so the
// caller can tell whether more exist.
func (s *Store) List(
	ctx context.Context,
	scope Scope,
	userID string,
	cur paging.Cursor,
	limit int,
) ([]Transaction, error) {
	rows, err := s.db.Q(ctx).Query(ctx, selectTransaction+` WHERE (`+scopeSQL[scope]+`)
		AND ($2::timestamptz IS NULL OR (t.created_at, t.id) < ($2, $3))
		ORDER BY t.created_at DESC, t.id DESC
		LIMIT $4`, userID, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Transaction

	for rows.Next() {
		t, err := scan(rows)
		if err != nil {
			return nil, err
		}

		out = append(out, t)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows.Close()

	return out, s.fill(ctx, out)
}

// fill loads the items and receipts of every listed transaction in two
// queries, whatever the page size.
func (s *Store) fill(ctx context.Context, list []Transaction) error {
	if len(list) == 0 {
		return nil
	}

	ids := make([]string, len(list))
	at := make(map[string]int, len(list))

	for i, t := range list {
		ids[i], at[t.ID] = t.ID, i
	}

	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT i.transaction_id, i.material_id, m.name, i.weight::text, i.price::text
		FROM transaction_items i JOIN materials m ON m.id = i.material_id
		WHERE i.transaction_id = ANY($1) ORDER BY i.transaction_id, i.position`, ids)
	if err != nil {
		return err
	}

	for rows.Next() {
		var id string

		var item Item

		if err := rows.Scan(&id, &item.MaterialID, &item.MaterialName, &item.Weight, &item.Price); err != nil {
			rows.Close()

			return err
		}

		list[at[id]].Items = append(list[at[id]].Items, item)
	}

	rows.Close()

	if err := rows.Err(); err != nil {
		return err
	}

	rows, err = s.db.Q(ctx).Query(ctx, `
		SELECT transaction_id, id, file_name, content_type, size, uploaded_at
		FROM transaction_receipts WHERE transaction_id = ANY($1)
		ORDER BY transaction_id, uploaded_at, id`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id string

		var r Receipt

		if err := rows.Scan(&id, &r.ID, &r.FileName, &r.ContentType, &r.Size, &r.UploadedAt); err != nil {
			return err
		}

		list[at[id]].Receipts = append(list[at[id]].Receipts, r)
	}

	return rows.Err()
}
