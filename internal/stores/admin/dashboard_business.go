package admin

import "context"

// BusinessActions counts current work across all dates for one active business.
type BusinessActions struct {
	RequestsWaiting int `json:"requests_waiting"`
	TradesToInvoice int `json:"trades_to_invoice"`
	Listings        int `json:"listings"`
}

// BusinessWork returns task counts and collection presence for the authenticated business.
func (s *Store) BusinessWork(ctx context.Context, owner string) (BusinessActions, bool, error) {
	var actions BusinessActions
	var collects bool

	// Offered requests follow Accept: the recipient goes first, then the maker,
	// neither repeats a confirmation, and every offered line needs a live hold.
	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT
		(SELECT count(*) FROM transaction_requests r
		 WHERE (r.seller_id=$1 AND r.status='pending') OR (
			r.status='offered' AND r.offer_by IS NOT NULL AND (
				(r.seller_id=$1 AND r.seller_confirmed_version IS DISTINCT FROM r.offer_version
				 AND (r.offer_by<>$1 OR r.buyer_confirmed_version=r.offer_version)) OR
				(r.buyer_id=$1 AND r.buyer_confirmed_version IS DISTINCT FROM r.offer_version
				 AND (r.offer_by<>$1 OR r.seller_confirmed_version=r.offer_version)))
			AND (SELECT count(*) FROM transaction_request_items i WHERE i.request_id=r.id
				AND i.offer_weight IS NOT NULL AND i.offer_price IS NOT NULL)>0
			AND (SELECT count(*) FROM stock_holds h WHERE h.request_id=r.id
				AND h.status='active' AND h.expires_at>clock_timestamp()) =
				(SELECT count(*) FROM transaction_request_items i WHERE i.request_id=r.id
				 AND i.offer_weight IS NOT NULL AND i.offer_price IS NOT NULL))),
		(SELECT count(*) FROM transactions t WHERE t.type='b2b' AND t.status='complete'
		 AND t.invoice_key IS NULL AND (t.buyer_id=$1 OR t.seller_id=$1)),
		(SELECT count(*) FROM stock WHERE owner_id=$1 AND is_listed),
		(EXISTS(SELECT 1 FROM collectors WHERE created_by_business_id=$1) OR
		 EXISTS(SELECT 1 FROM transactions WHERE buyer_id=$1 AND type='c2b' AND status='complete'))`,
		owner).Scan(&actions.RequestsWaiting, &actions.TradesToInvoice, &actions.Listings, &collects)

	return actions, collects, err
}
