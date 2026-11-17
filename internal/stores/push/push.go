// Package push owns the SQL for phone alert subscriptions. A subscription is
// one browser; the rules live in services.
package push

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// maxPerUser is how many browsers one person may keep; the oldest go first.
const maxPerUser = 10

// Subscription is one browser's push address and keys.
type Subscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

// Message is a notification row as it is shown in a push.
type Message struct {
	UserID string
	Title  string
	Body   string
	Link   string
}

// Store runs the push subscription SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Save keeps the subscription for the person. An endpoint already held by
// someone else moves to them, because only that browser can know it.
func (s *Store) Save(ctx context.Context, userID string, sub Subscription) error {
	q := s.db.Q(ctx)

	_, err := q.Exec(ctx, `
		INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (endpoint) DO UPDATE
		SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
			auth = EXCLUDED.auth, created_at = now()`,
		database.NewID(), userID, sub.Endpoint, sub.P256dh, sub.Auth)
	if err != nil {
		return err
	}

	_, err = q.Exec(ctx, `
		DELETE FROM push_subscriptions WHERE user_id = $1 AND id NOT IN (
			SELECT id FROM push_subscriptions WHERE user_id = $1
			ORDER BY created_at DESC, id DESC LIMIT $2)`, userID, maxPerUser)

	return err
}

// Remove deletes the person's own subscription for the endpoint. Someone
// else's endpoint is left alone.
func (s *Store) Remove(ctx context.Context, userID, endpoint string) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, userID, endpoint)

	return err
}

// RemoveEndpoint deletes a subscription the push service said is gone.
func (s *Store) RemoveEndpoint(ctx context.Context, endpoint string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `DELETE FROM push_subscriptions WHERE endpoint = $1`, endpoint)

	return err
}

// Message loads a notification and the browsers of the person it belongs to.
// ok is false when the notification is gone.
func (s *Store) Message(ctx context.Context, id string) (Message, []Subscription, bool, error) {
	var m Message

	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT user_id, title, body, COALESCE(link, '') FROM notifications WHERE id = $1`, id).
		Scan(&m.UserID, &m.Title, &m.Body, &m.Link)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, nil, false, nil
	}

	if err != nil {
		return m, nil, false, err
	}

	rows, err := s.db.Q(ctx).Query(ctx,
		`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, m.UserID)
	if err != nil {
		return m, nil, false, err
	}
	defer rows.Close()

	var subs []Subscription

	for rows.Next() {
		var sub Subscription
		if err := rows.Scan(&sub.Endpoint, &sub.P256dh, &sub.Auth); err != nil {
			return m, nil, false, err
		}

		subs = append(subs, sub)
	}

	return m, subs, true, rows.Err()
}
