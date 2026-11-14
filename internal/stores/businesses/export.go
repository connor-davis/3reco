package businesses

import (
	"context"
	"encoding/json"
)

// exportQueries are the sections of a business's data export. $1 is always the
// business id. Each query names its columns, so a new column never leaks into
// an export by accident.
// ponytail: collector payout is exported masked; upgrade by opening the sealed
// numbers in the service if an Owner needs them whole.
var exportQueries = []struct{ name, sql string }{
	{"members", `SELECT u.name, u.email, m.role FROM business_members m
		JOIN users u ON u.id=m.user_id WHERE m.business_id=$1 AND NOT u.is_removed ORDER BY u.name`},
	{"stock", `SELECT id, material_id, weight, price, is_listed, (image_key IS NOT NULL) AS has_image,
		created_at, updated_at FROM stock WHERE owner_id=$1 ORDER BY created_at`},
	{"requests", `SELECT r.id, r.status, r.seller_id, r.buyer_id, r.created_at, r.updated_at,
		(SELECT COALESCE(jsonb_agg(jsonb_build_object('material_id', i.material_id,
			'offer_weight', i.offer_weight, 'offer_price', i.offer_price) ORDER BY i.position), '[]'::jsonb)
			FROM transaction_request_items i WHERE i.request_id = r.id) AS items
		FROM transaction_requests r WHERE r.buyer_id=$1 OR r.seller_id=$1 ORDER BY r.created_at`},
	{"transactions", `SELECT t.id, t.type, t.status, t.duplicate_of, t.seller_id, t.buyer_id, t.total_price,
		t.collection_date, t.created_at,
		(SELECT COALESCE(jsonb_agg(jsonb_build_object('material_id', i.material_id,
			'weight', i.weight, 'price', i.price) ORDER BY i.position), '[]'::jsonb)
			FROM transaction_items i WHERE i.transaction_id = t.id) AS items
		FROM transactions t WHERE t.buyer_id=$1 OR t.seller_id=$1 ORDER BY t.created_at`},
	{"collectors", `SELECT id, name, email, phone, street_address, city, province, area_code,
		payout_method, bank_name, mask_stored4(bank_account_last4) AS bank_account_number,
		ewallet_platform_name, mask_stored4(ewallet_payment_id_last4) AS ewallet_payment_id, created_at
		FROM collectors WHERE created_by_business_id=$1 ORDER BY created_at`},
}

// Export reads every section of one business's data, plus its row with the
// sealed account number so the service can open it.
func (s *Store) Export(ctx context.Context, id string) (map[string]json.RawMessage, string, error) {
	out := map[string]json.RawMessage{}

	for _, q := range exportQueries {
		var rows json.RawMessage
		err := s.db.Q(ctx).QueryRow(ctx,
			`SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (`+q.sql+`) x`, id).Scan(&rows)
		if err != nil {
			return nil, "", err
		}

		out[q.name] = rows
	}

	var sealed string
	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT COALESCE(bank_account_number,'') FROM businesses WHERE id=$1`, id).Scan(&sealed)

	return out, sealed, err
}
