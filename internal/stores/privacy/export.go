package privacy

import (
	"context"
	"encoding/json"
)

// section runs a query that returns the rows to export and returns them as one
// JSON array. Each query names its columns, so a new column on a table never
// leaks into an export by accident.
func (s *Store) section(ctx context.Context, query string, userID string) (json.RawMessage, error) {
	var out json.RawMessage
	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (`+query+`) x`, userID).Scan(&out)

	return out, err
}

// exportQueries are the sections of a person's own data, in the order they
// appear in the file. $1 is always the caller. Session token hashes, password
// hashes and other people's profiles are never selected.
var exportQueries = []struct{ name, sql string }{
	{"sessions", `SELECT id, ip, user_agent, created_at, refreshed_at, expires_at
		FROM sessions WHERE user_id = $1 ORDER BY created_at`},
	{"notice_acceptances", `SELECT version, accepted_at FROM privacy_notice_acceptances
		WHERE user_id = $1 ORDER BY accepted_at`},
	{"stock", `SELECT id, material_id, weight, price, is_listed, created_at, updated_at
		FROM stock WHERE owner_id = $1 ORDER BY created_at`},
	{"requests", `SELECT r.id, r.status, r.seller_id, r.buyer_id, r.created_at, r.updated_at,
		(SELECT COALESCE(jsonb_agg(jsonb_build_object('material_id', i.material_id,
			'offer_weight', i.offer_weight, 'offer_price', i.offer_price) ORDER BY i.position), '[]'::jsonb)
			FROM transaction_request_items i WHERE i.request_id = r.id) AS items,
		(SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'sender_id', m.sender_id,
			'content', m.content, 'created_at', m.created_at) ORDER BY m.created_at), '[]'::jsonb)
			FROM transaction_request_messages m WHERE m.request_id = r.id) AS messages
		FROM transaction_requests r WHERE r.buyer_id = $1 OR r.seller_id = $1 ORDER BY r.created_at`},
	{"transactions", `SELECT t.id, t.type, t.seller_id, t.buyer_id, t.total_price, t.collection_day,
		t.collection_date, t.created_at, t.anonymised_at,
		(SELECT COALESCE(jsonb_agg(jsonb_build_object('material_id', i.material_id,
			'weight', i.weight, 'price', i.price) ORDER BY i.position), '[]'::jsonb)
			FROM transaction_items i WHERE i.transaction_id = t.id) AS items
		FROM transactions t WHERE t.buyer_id = $1 OR (t.type = 'b2b' AND t.seller_id = $1)
		ORDER BY t.created_at`},
	{"reviews", `SELECT id, seller_id, buyer_id, transaction_id, rating, comment, created_at
		FROM store_reviews WHERE buyer_id = $1 OR seller_id = $1 ORDER BY created_at`},
	{"notifications", `SELECT id, type, title, body, link, read, dismissed, created_at
		FROM notifications WHERE user_id = $1 ORDER BY created_at`},
	{"carts", `SELECT c.id, c.buyer_id, c.seller_id, c.created_at, c.updated_at,
		(SELECT COALESCE(jsonb_agg(jsonb_build_object('stock_id', i.stock_id,
			'material_id', i.material_id)), '[]'::jsonb) FROM cart_items i WHERE i.cart_id = c.id) AS items
		FROM carts c WHERE c.buyer_id = $1 OR c.seller_id = $1 ORDER BY c.created_at`},
	{"receipt_files", `SELECT id, transaction_id, object_key, file_name, content_type, size, uploaded_at
		FROM transaction_receipts WHERE uploaded_by = $1 ORDER BY uploaded_at`},
	{"invoice_files", `SELECT id AS transaction_id, invoice_key FROM transactions
		WHERE invoice_key IS NOT NULL AND (buyer_id = $1 OR (type = 'b2b' AND seller_id = $1))
		ORDER BY created_at`},
}

// Export reads every section of the user's own data. The profile and the
// collectors they created come from their own stores, because those hold
// sealed fields.
func (s *Store) Export(ctx context.Context, userID string) (map[string]json.RawMessage, error) {
	out := map[string]json.RawMessage{}

	for _, q := range exportQueries {
		rows, err := s.section(ctx, q.sql, userID)
		if err != nil {
			return nil, err
		}

		out[q.name] = rows
	}

	var avatar *string
	err := s.db.Q(ctx).QueryRow(ctx, `SELECT avatar_key FROM users WHERE id = $1`, userID).Scan(&avatar)
	if err != nil {
		return nil, err
	}

	file, err := json.Marshal(map[string]*string{"avatar_key": avatar})
	if err != nil {
		return nil, err
	}

	out["avatar_file"] = file

	return out, nil
}
