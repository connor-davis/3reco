package requests

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Message is one chat line on a request.
type Message struct {
	ID        string    `json:"id"`
	SenderID  string    `json:"sender_id"`
	Content   string    `json:"content"`
	System    bool      `json:"system"`
	CreatedAt time.Time `json:"created_at"`
}

// Thread is one row of the inbox: an active request, the other person, the
// newest message (if any) and how many of the other person's messages the
// caller has not read.
type Thread struct {
	Buyer                  database.Party `json:"buyer"`
	Seller                 database.Party `json:"seller"`
	OfferBy                *string        `json:"offer_by"`
	OfferVersion           int            `json:"offer_version"`
	BuyerConfirmedVersion  *int           `json:"buyer_confirmed_version"`
	SellerConfirmedVersion *int           `json:"seller_confirmed_version"`
	RequestID              string         `json:"request_id"`
	Status                 string         `json:"status"`
	Other                  database.Party `json:"other"`
	LatestMessage          *Message       `json:"latest_message"`
	UnreadCount            int            `json:"unread_count"`
	ActivityAt             time.Time      `json:"activity_at"`
}

// Messages returns up to limit+1 messages of a request, newest first, before
// the cursor.
func (s *Store) Messages(
	ctx context.Context,
	requestID string,
	cur paging.Cursor,
	limit int,
) ([]Message, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT id, sender_id, content, created_at, system FROM transaction_request_messages
		WHERE request_id = $1 AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3))
		ORDER BY created_at DESC, id DESC
		LIMIT $4`, requestID, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Message

	for rows.Next() {
		var m Message

		if err := rows.Scan(&m.ID, &m.SenderID, &m.Content, &m.CreatedAt, &m.System); err != nil {
			return nil, err
		}

		out = append(out, m)
	}

	return out, rows.Err()
}

// InsertRequestEvent records a request action as a system line, unread by the other side.
func (s *Store) InsertRequestEvent(ctx context.Context, requestID, buyerID, content string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO transaction_request_messages (id, request_id, sender_id, content, system)
		VALUES ($1, $2, $3, $4, true)`, database.NewID(), requestID, buyerID, content)

	return err
}

// InsertMessage adds a chat line and returns its id and time.
func (s *Store) InsertMessage(
	ctx context.Context,
	requestID, senderID, content string,
) (Message, error) {
	m := Message{ID: database.NewID(), SenderID: senderID, Content: content}

	err := s.db.Q(ctx).QueryRow(ctx, `
		INSERT INTO transaction_request_messages (id, request_id, sender_id, content)
		VALUES ($1, $2, $3, $4) RETURNING created_at`,
		m.ID, requestID, senderID, content).Scan(&m.CreatedAt)

	return m, err
}

// MarkRead marks every message the other person sent on a request as read by
// the user. Messages already marked are left alone.
func (s *Store) MarkRead(ctx context.Context, requestID, userID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO request_message_reads (message_id, user_id)
		SELECT m.id, $2 FROM transaction_request_messages m
		WHERE m.request_id = $1 AND m.sender_id <> $2
		ON CONFLICT DO NOTHING`, requestID, userID)

	return err
}

// Inbox returns up to limit+1 requests of any status the user takes part in (a
// finished chat stays findable; filter "done" shows only those), most
// recent activity first. Activity is the newest message, or the request
// itself when nobody has written yet.
func (s *Store) Inbox(
	ctx context.Context,
	userID string,
	cur paging.Cursor,
	limit int,
	search, filter string,
) ([]Thread, error) {
	// The page is cut first; unread counts are then summed once for its requests.
	rows, err := s.db.Q(ctx).Query(ctx, `
		WITH page AS (
		SELECT r.id, r.status, o.id AS other_id, `+database.DisplayName("o")+` AS other_name,
			lm.id AS lm_id, lm.sender_id AS lm_sender, lm.content AS lm_content,
			lm.created_at AS lm_at, lm.system AS lm_system, r.activity_at AS activity,
            r.buyer_id, `+database.DisplayName("b")+` AS buyer_name,
            r.seller_id, `+database.DisplayName("sl")+` AS seller_name,
            r.offer_by, r.offer_version, r.buyer_confirmed_version, r.seller_confirmed_version
		FROM transaction_requests r
		JOIN users b ON b.id = r.buyer_id
        JOIN users sl ON sl.id = r.seller_id
        JOIN users o ON o.id = CASE WHEN r.seller_id = $1 THEN r.buyer_id ELSE r.seller_id END
		LEFT JOIN LATERAL (
			SELECT id, sender_id, content, created_at, system FROM transaction_request_messages
			WHERE request_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) lm ON true
		WHERE (r.seller_id = $1 OR r.buyer_id = $1)
			AND ($5 = '' OR strpos(lower(`+database.DisplayName("o")+`), lower($5)) > 0
				OR strpos(lower(COALESCE(lm.content, '')), lower($5)) > 0
				OR EXISTS (SELECT 1 FROM transaction_request_items i JOIN materials m ON m.id = i.material_id
					WHERE i.request_id = r.id AND strpos(lower(m.name), lower($5)) > 0))
			AND ($6 <> 'offers' OR r.status = 'offered')
			AND ($6 <> 'done' OR r.status IN ('accepted', 'rejected', 'cancelled'))
			AND ($6 <> 'unread' OR EXISTS (SELECT 1 FROM transaction_request_messages m
				WHERE m.request_id = r.id AND m.sender_id <> $1 AND NOT EXISTS (
					SELECT 1 FROM request_message_reads x WHERE x.message_id = m.id AND x.user_id = $1)))
			AND ($2::timestamptz IS NULL OR (r.activity_at, r.id) < ($2, $3))
		ORDER BY activity DESC, r.id DESC
		LIMIT $4)
		SELECT page.id, page.status, page.other_id, page.other_name, page.lm_id, page.lm_sender,
			page.lm_content, page.lm_at, COALESCE(un.n, 0), page.activity, page.lm_system,
            page.buyer_id, page.buyer_name, page.seller_id, page.seller_name,
            page.offer_by, page.offer_version, page.buyer_confirmed_version, page.seller_confirmed_version
		FROM page
		LEFT JOIN (SELECT m.request_id, count(*) AS n FROM transaction_request_messages m
			WHERE m.request_id IN (SELECT id FROM page) AND m.sender_id <> $1 AND NOT EXISTS (
				SELECT 1 FROM request_message_reads x
				WHERE x.message_id = m.id AND x.user_id = $1)
			GROUP BY m.request_id) un ON un.request_id = page.id
		ORDER BY page.activity DESC, page.id DESC`, userID, cur.At, cur.ID, limit+1, search, filter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Thread

	for rows.Next() {
		var t Thread

		var last Message

		var lastID, lastSender, lastContent *string

		var lastAt *time.Time

		var lastSystem *bool

		err := rows.Scan(&t.RequestID, &t.Status, &t.Other.ID, &t.Other.Name,
			&lastID, &lastSender, &lastContent, &lastAt, &t.UnreadCount, &t.ActivityAt,
			&lastSystem, &t.Buyer.ID, &t.Buyer.Name, &t.Seller.ID, &t.Seller.Name,
			&t.OfferBy, &t.OfferVersion, &t.BuyerConfirmedVersion, &t.SellerConfirmedVersion)
		if err != nil {
			return nil, err
		}

		if lastID != nil {
			last = Message{ID: *lastID, SenderID: *lastSender, Content: *lastContent, CreatedAt: *lastAt, System: *lastSystem}
			t.LatestMessage = &last
		}

		out = append(out, t)
	}

	return out, rows.Err()
}

// AdminThread is one row of the admin list of every conversation: both sides
// and the newest message, with no unread count because an admin reads for
// nobody.
type AdminThread struct {
	OfferBy                *string        `json:"offer_by"`
	OfferVersion           int            `json:"offer_version"`
	BuyerConfirmedVersion  *int           `json:"buyer_confirmed_version"`
	SellerConfirmedVersion *int           `json:"seller_confirmed_version"`
	RequestID              string         `json:"request_id"`
	Status                 string         `json:"status"`
	Buyer                  database.Party `json:"buyer"`
	Seller                 database.Party `json:"seller"`
	LatestMessage          *Message       `json:"latest_message"`
	ActivityAt             time.Time      `json:"activity_at"`
}

// AllThreads returns up to limit+1 requests of any status, most recent
// activity first, with both sides and the newest message. Callers must have
// checked the user is an admin.
func (s *Store) AllThreads(
	ctx context.Context,
	cur paging.Cursor,
	limit int,
	search, filter string,
) ([]AdminThread, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT r.id, r.status, b.id, `+database.DisplayName("b")+`,
			sl.id, `+database.DisplayName("sl")+`,
			lm.id, lm.sender_id, lm.content, lm.created_at,
			r.activity_at AS activity, lm.system,
            r.offer_by, r.offer_version, r.buyer_confirmed_version, r.seller_confirmed_version
        FROM transaction_requests r
		JOIN users b ON b.id = r.buyer_id
		JOIN users sl ON sl.id = r.seller_id
		LEFT JOIN LATERAL (
			SELECT id, sender_id, content, created_at, system FROM transaction_request_messages
			WHERE request_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) lm ON true
		WHERE ($4 = '' OR strpos(lower(`+database.DisplayName("b")+`), lower($4)) > 0
			OR strpos(lower(`+database.DisplayName("sl")+`), lower($4)) > 0
			OR strpos(lower(COALESCE(lm.content, '')), lower($4)) > 0
			OR EXISTS (SELECT 1 FROM transaction_request_items i JOIN materials m ON m.id = i.material_id
				WHERE i.request_id = r.id AND strpos(lower(m.name), lower($4)) > 0))
			AND ($5 <> 'offers' OR r.status = 'offered')
			AND ($5 <> 'done' OR r.status IN ('accepted', 'rejected', 'cancelled'))
			AND ($1::timestamptz IS NULL OR (r.activity_at, r.id) < ($1, $2))
		ORDER BY activity DESC, r.id DESC
		LIMIT $3`, cur.At, cur.ID, limit+1, search, filter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []AdminThread

	for rows.Next() {
		var t AdminThread

		var lastID, lastSender, lastContent *string

		var lastAt *time.Time

		var lastSystem *bool

		err := rows.Scan(&t.RequestID, &t.Status, &t.Buyer.ID, &t.Buyer.Name,
			&t.Seller.ID, &t.Seller.Name, &lastID, &lastSender, &lastContent, &lastAt, &t.ActivityAt,
			&lastSystem, &t.OfferBy, &t.OfferVersion, &t.BuyerConfirmedVersion, &t.SellerConfirmedVersion)
		if err != nil {
			return nil, err
		}

		if lastID != nil {
			t.LatestMessage = &Message{
				ID: *lastID, SenderID: *lastSender, Content: *lastContent, CreatedAt: *lastAt, System: *lastSystem,
			}
		}

		out = append(out, t)
	}

	return out, rows.Err()
}
