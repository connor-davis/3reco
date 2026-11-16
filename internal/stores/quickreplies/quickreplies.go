// Package quickreplies owns the SQL for a person's saved chat replies.
package quickreplies

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Reply is one saved message a person can drop into a chat box.
type Reply struct {
	ID        string    `json:"id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

// Store runs caller-scoped quick reply SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// List returns only the named person's replies, oldest first.
func (s *Store) List(ctx context.Context, userID string) ([]Reply, error) {
	rows, err := s.db.Q(ctx).Query(
		ctx,
		`SELECT id,body,created_at FROM quick_replies WHERE user_id=$1 ORDER BY created_at,id`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Reply{}
	for rows.Next() {
		var reply Reply
		if err := rows.Scan(&reply.ID, &reply.Body, &reply.CreatedAt); err != nil {
			return nil, err
		}

		items = append(items, reply)
	}

	return items, rows.Err()
}

// Create saves a reply unless the person already holds max of them, and says whether it did.
// The person's row is locked first so two taps at once cannot both pass the limit.
func (s *Store) Create(ctx context.Context, userID, id, body string, max int) (bool, error) {
	var saved bool

	err := s.db.InTx(ctx, func(ctx context.Context) error {
		q := s.db.Q(ctx)
		if _, err := q.Exec(ctx, `SELECT 1 FROM users WHERE id=$1 FOR UPDATE`, userID); err != nil {
			return err
		}

		result, err := q.Exec(
			ctx,
			`
			INSERT INTO quick_replies (id,user_id,body)
			SELECT $1,$2,$3
			WHERE (SELECT count(*) FROM quick_replies WHERE user_id=$2) < $4`,
			id,
			userID,
			body,
			max,
		)
		saved = err == nil && result.RowsAffected() == 1

		return err
	})

	return saved, err
}

// Update changes only the person's own reply and says whether it was found.
func (s *Store) Update(ctx context.Context, userID, id, body string) (bool, error) {
	result, err := s.db.Q(ctx).Exec(
		ctx,
		`UPDATE quick_replies SET body=$3,updated_at=now() WHERE user_id=$1 AND id=$2`,
		userID,
		id,
		body,
	)

	return result.RowsAffected() == 1, err
}

// Delete removes only the person's own reply and says whether it was found.
func (s *Store) Delete(ctx context.Context, userID, id string) (bool, error) {
	result, err := s.db.Q(ctx).Exec(
		ctx,
		`DELETE FROM quick_replies WHERE user_id=$1 AND id=$2`,
		userID,
		id,
	)

	return result.RowsAffected() == 1, err
}
