package stats

import "context"

// ViewCounts contains private listing opens in Johannesburg calendar days.
type ViewCounts struct {
	Days7    int64 `json:"days_7"`
	Days30   int64 `json:"days_30"`
	Lifetime int64 `json:"lifetime"`
}

// ListingViews is a seller's own stock row and its private view counts.
type ListingViews struct {
	ID           string     `json:"id"`
	MaterialName string     `json:"material_name"`
	Listed       bool       `json:"is_listed"`
	Views        ViewCounts `json:"views"`
}

// ReplyStats counts received requests and first replies in the last 90 days.
type ReplyStats struct {
	Requests  int64 `json:"requests"`
	WithinDay int64 `json:"within_day"`
}

// UsuallyWithinDay requires at least five requests and half answered in 24 hours.
func (reply ReplyStats) UsuallyWithinDay() bool {
	return reply.Requests >= 5 && reply.WithinDay*2 >= reply.Requests
}

// SellerStats is available only to members of the seller's active business.
type SellerStats struct {
	Views    ViewCounts     `json:"views"`
	Listings []ListingViews `json:"listings"`
	Replies  ReplyStats     `json:"replies"`
}

// RecordView deduplicates an eligible successful detail read. Membership in any
// workspace of the seller excludes the person, even with another workspace active.
func (records *Store) RecordView(ctx context.Context, stockID, viewerID string) error {
	_, err := records.db.Q(ctx).Exec(ctx, `
		INSERT INTO listing_views(stock_id,viewer_id,day)
		SELECT s.id,u.id,(now() AT TIME ZONE 'Africa/Johannesburg')::date
		FROM stock s JOIN users u ON u.id=$2
		JOIN businesses b ON b.id=s.owner_id
		WHERE s.id=$1 AND s.is_listed AND s.weight>0 AND NOT b.is_removed
		AND b.business_verified_at IS NOT NULL AND NOT u.is_removed
		AND COALESCE(u.role,'') NOT IN ('admin','staff') AND u.id<>s.owner_id
		AND NOT EXISTS(SELECT 1 FROM business_members bm
			WHERE bm.business_id=s.owner_id AND bm.user_id=u.id)
		ON CONFLICT DO NOTHING`, stockID, viewerID)

	return err
}

// Seller reads all owned stock, including zero-view and unlisted rows, in rank order.
func (records *Store) Seller(ctx context.Context, sellerID string) (SellerStats, error) {
	result := SellerStats{Listings: []ListingViews{}}
	rows, err := records.db.Q(ctx).Query(ctx, `
		SELECT s.id,m.name,s.is_listed,
			count(v.stock_id) FILTER(WHERE v.day>=d.today-6),
			count(v.stock_id) FILTER(WHERE v.day>=d.today-29),count(v.stock_id)
		FROM stock s JOIN materials m ON m.id=s.material_id
		CROSS JOIN (SELECT (now() AT TIME ZONE 'Africa/Johannesburg')::date AS today) d
		LEFT JOIN listing_views v ON v.stock_id=s.id AND v.day<=d.today
		WHERE s.owner_id=$1 GROUP BY s.id,m.name
		ORDER BY count(v.stock_id) FILTER(WHERE v.day>=d.today-29) DESC,s.id`, sellerID)
	if err != nil {
		return result, err
	}

	for rows.Next() {
		var item ListingViews
		err := rows.Scan(
			&item.ID, &item.MaterialName, &item.Listed,
			&item.Views.Days7, &item.Views.Days30, &item.Views.Lifetime,
		)
		if err != nil {
			rows.Close()
			return result, err
		}

		result.Listings = append(result.Listings, item)
		result.Views.Days7 += item.Views.Days7
		result.Views.Days30 += item.Views.Days30
		result.Views.Lifetime += item.Views.Lifetime
	}

	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}

	result.Replies, err = records.Replies(ctx, sellerID)
	return result, err
}

// Replies times the first seller-side message, including human-triggered system
// events. No reply stays in the denominator. Automated system events do not count.
func (records *Store) Replies(ctx context.Context, sellerID string) (ReplyStats, error) {
	var result ReplyStats
	err := records.db.Q(ctx).QueryRow(ctx, `
		SELECT count(*),count(*) FILTER(WHERE reply.at<=r.created_at+interval '24 hours')
		FROM transaction_requests r
		LEFT JOIN LATERAL (
			SELECT min(m.created_at) AS at FROM transaction_request_messages m
			WHERE m.request_id=r.id AND m.created_at>=r.created_at AND m.created_at<=now()
			AND (EXISTS(SELECT 1 FROM business_members bm
				WHERE bm.business_id=r.seller_id AND bm.user_id=m.sender_id)
				OR (m.sender_id=r.seller_id AND NOT EXISTS(
					SELECT 1 FROM businesses b WHERE b.id=r.seller_id)))
			AND (NOT m.system OR EXISTS(SELECT 1 FROM audit_log a
				WHERE a.table_name='transaction_request_messages' AND a.action='insert'
				AND a.actor_id IS NOT NULL AND a.actor_id=m.sender_id AND a.row_key->>'id'=m.id))
		) reply ON true
		WHERE r.seller_id=$1 AND r.created_at>=now()-interval '90 days'
		AND r.created_at<=now()`, sellerID).Scan(&result.Requests, &result.WithinDay)

	return result, err
}
