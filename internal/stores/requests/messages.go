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
	CreatedAt time.Time `json:"created_at"`
}

// Thread is one row of the inbox: a pending request, the other person, the
// newest message (if any) and how many of the other person's messages the
// caller has not read.
type Thread struct {
	RequestID     string         `json:"request_id"`
	Status        string         `json:"status"`
	Other         database.Party `json:"other"`
	LatestMessage *Message       `json:"latest_message"`
	UnreadCount   int            `json:"unread_count"`
	ActivityAt    time.Time      `json:"activity_at"`
}

// Messages returns up to limit+1 messages of a request, oldest first, after
// the cursor.
func (s *Store) Messages(
	ctx context.Context,
	requestID string,
	cur paging.Cursor,
	limit int,
) ([]Message, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT id, sender_id, content, created_at FROM transaction_request_messages
		WHERE request_id = $1 AND ($2::timestamptz IS NULL OR (created_at, id) > ($2, $3))
		ORDER BY created_at, id
		LIMIT $4`, requestID, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Message

	for rows.Next() {
		var m Message

		if err := rows.Scan(&m.ID, &m.SenderID, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}

		out = append(out, m)
	}

	return out, rows.Err()
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

// Inbox returns up to limit+1 pending requests the user takes part in, most
// recent activity first. Activity is the newest message, or the request
// itself when nobody has written yet.
func (s *Store) Inbox(
	ctx context.Context,
	userID string,
	cur paging.Cursor,
	limit int,
) ([]Thread, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT r.id, r.status, o.id, `+database.DisplayName("o")+`,
			lm.id, lm.sender_id, lm.content, lm.created_at,
			(SELECT count(*) FROM transaction_request_messages m
				WHERE m.request_id = r.id AND m.sender_id <> $1 AND NOT EXISTS (
					SELECT 1 FROM request_message_reads x
					WHERE x.message_id = m.id AND x.user_id = $1)),
			COALESCE(lm.created_at, r.created_at) AS activity
		FROM transaction_requests r
		JOIN users o ON o.id = CASE WHEN r.seller_id = $1 THEN r.buyer_id ELSE r.seller_id END
		LEFT JOIN LATERAL (
			SELECT id, sender_id, content, created_at FROM transaction_request_messages
			WHERE request_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) lm ON true
		WHERE (r.seller_id = $1 OR r.buyer_id = $1) AND r.status = 'pending'
			AND ($2::timestamptz IS NULL OR (COALESCE(lm.created_at, r.created_at), r.id) < ($2, $3))
		ORDER BY activity DESC, r.id DESC
		LIMIT $4`, userID, cur.At, cur.ID, limit+1)
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

		err := rows.Scan(&t.RequestID, &t.Status, &t.Other.ID, &t.Other.Name,
			&lastID, &lastSender, &lastContent, &lastAt, &t.UnreadCount, &t.ActivityAt)
		if err != nil {
			return nil, err
		}

		if lastID != nil {
			last = Message{ID: *lastID, SenderID: *lastSender, Content: *lastContent, CreatedAt: *lastAt}
			t.LatestMessage = &last
		}

		out = append(out, t)
	}

	return out, rows.Err()
}
