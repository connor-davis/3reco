// Package notifications is the database access for the bell: one row per
// message a user is told about. SQL only; the rules live in services.
package notifications

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Notification is one bell message as the API shows it to its owner.
type Notification struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Link      *string   `json:"link"`
	Read      bool      `json:"read"`
	CreatedAt time.Time `json:"created_at"`
}

// Store runs the notification SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Insert adds an unread message for a user. It joins the transaction in ctx,
// so a message never exists for something that rolled back.
func (s *Store) Insert(ctx context.Context, userID, kind, title, body, link string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO notifications (id, user_id, type, title, body, link)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))`,
		database.NewID(), userID, kind, title, body, link)

	return err
}

// InsertBusiness tells every current member, with an independent personal read state.
// A recipient that is a person rather than a business keeps a personal notification.
func (s *Store) InsertBusiness(ctx context.Context, recipient, kind, title, body, link string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO notifications (id, user_id, business_id, type, title, body, link)
		SELECT md5($1 || m.user_id), m.user_id, m.business_id, $3, $4, $5, NULLIF($6,'')
		FROM business_members m JOIN users u ON u.id=m.user_id
		WHERE m.business_id=$2 AND NOT u.is_removed
		UNION ALL
		SELECT $1, $2, NULL, $3, $4, $5, NULLIF($6,'')
		WHERE NOT EXISTS(SELECT 1 FROM businesses WHERE id=$2)`,
		database.NewID(), recipient, kind, title, body, link)

	return err
}

// notificationMembership also hides old business notices once membership ends.
const notificationMembership = ` AND (business_id IS NULL OR EXISTS(
	SELECT 1 FROM business_members m WHERE m.business_id=notifications.business_id
	AND m.user_id=notifications.user_id))`

// List returns a user's messages that were not dismissed, newest first. It
// fetches up to limit+1 rows so the caller can tell whether more exist.
func (s *Store) List(
	ctx context.Context,
	userID string,
	cur paging.Cursor,
	limit int,
) ([]Notification, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT id, type, title, body, link, read, created_at
		FROM notifications
		WHERE user_id = $1`+notificationMembership+` AND NOT dismissed
			AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3))
		ORDER BY created_at DESC, id DESC
		LIMIT $4`, userID, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Notification

	for rows.Next() {
		var n Notification

		err := rows.Scan(&n.ID, &n.Type, &n.Title, &n.Body, &n.Link, &n.Read, &n.CreatedAt)
		if err != nil {
			return nil, err
		}

		out = append(out, n)
	}

	return out, rows.Err()
}

// UnreadCount counts a user's unread, undismissed messages.
func (s *Store) UnreadCount(ctx context.Context, userID string) (int, error) {
	var n int

	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT count(*) FROM notifications
		WHERE user_id = $1`+notificationMembership+` AND NOT dismissed AND NOT read`, userID).Scan(&n)

	return n, err
}

// MarkRead marks one of the user's messages read. It reports false when the
// user owns no such message.
func (s *Store) MarkRead(ctx context.Context, userID, id string) (bool, error) {
	tag, err := s.db.Q(ctx).Exec(ctx,
		`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`+notificationMembership, id, userID)

	return tag.RowsAffected() > 0, err
}

// MarkAllRead marks every message of the user read.
func (s *Store) MarkAllRead(ctx context.Context, userID string) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`UPDATE notifications SET read = true WHERE user_id = $1 AND NOT read`+notificationMembership, userID)

	return err
}

// MarkOffersRead retires the offer prompts of a request that is still going,
// for every user. History stays; only the unread flag goes.
func (s *Store) MarkOffersRead(ctx context.Context, link string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE notifications SET read = true
		WHERE link = $1 AND NOT read AND type = 'request_accepted' AND title IN
			('Offer received', 'Offer received!', 'Please confirm the offer')`, link)

	return err
}

// DeleteRequestActions removes every prompt a finished request left behind,
// for every user: they ask for something that can no longer be done. Chat
// notices stay as history and are only marked read. Call it before inserting
// the outcome notice, so that one survives.
func (s *Store) DeleteRequestActions(ctx context.Context, link string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `DELETE FROM notifications WHERE link = $1 AND type IN
		('request_received', 'request_accepted', 'request_rejected', 'request_cancelled')`, link)
	if err != nil {
		return err
	}

	_, err = s.db.Q(ctx).Exec(ctx, `UPDATE notifications SET read = true
		WHERE link = $1 AND NOT read AND type = 'message_received'`, link)

	return err
}

// Dismiss hides one of the user's messages. It reports false when the user
// owns no such message.
func (s *Store) Dismiss(ctx context.Context, userID, id string) (bool, error) {
	tag, err := s.db.Q(ctx).Exec(ctx,
		`UPDATE notifications SET dismissed = true WHERE id = $1 AND user_id = $2`+notificationMembership, id, userID)

	return tag.RowsAffected() > 0, err
}

// DismissAll hides every message of the user.
func (s *Store) DismissAll(ctx context.Context, userID string) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`UPDATE notifications SET dismissed = true WHERE user_id = $1`+notificationMembership+` AND NOT dismissed`, userID)

	return err
}
