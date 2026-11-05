// Package privacy is the database access for privacy rights: the notice
// people accepted, the audit log, a person's own data export, erasure and the
// retention clean-up. SQL only; the rules live in services/privacy.
package privacy

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Event is one line of the audit log. It holds no personal details, only who
// did what to whom.
type Event struct {
	ID        string    `json:"id"`
	ActorID   string    `json:"actor_id"`
	SubjectID *string   `json:"subject_id"`
	Kind      string    `json:"kind"`
	CreatedAt time.Time `json:"created_at"`
}

// Store runs the privacy SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Record writes one audit line. An empty subject means a bulk read (a CSV).
func (s *Store) Record(ctx context.Context, actor, subject, kind string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO privacy_events (id, actor_id, subject_id, kind)
		VALUES ($1, $2, NULLIF($3, ''), $4)`, database.NewID(), actor, subject, kind)

	return err
}

// Events returns up to limit+1 audit lines, newest first.
func (s *Store) Events(ctx context.Context, cur paging.Cursor, limit int) ([]Event, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT id, actor_id, subject_id, kind, created_at FROM privacy_events
		WHERE ($1::timestamptz IS NULL OR (created_at, id) < ($1, $2))
		ORDER BY created_at DESC, id DESC LIMIT $3`, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Event{}

	for rows.Next() {
		var e Event

		if err := rows.Scan(&e.ID, &e.ActorID, &e.SubjectID, &e.Kind, &e.CreatedAt); err != nil {
			return nil, err
		}

		out = append(out, e)
	}

	return out, rows.Err()
}

// Accepted reports whether the user accepted this notice version.
func (s *Store) Accepted(ctx context.Context, userID, version string) (bool, error) {
	var found bool
	err := s.db.Q(ctx).QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM privacy_notice_acceptances WHERE user_id = $1 AND version = $2)`,
		userID, version).Scan(&found)

	return found, err
}

// Accept records that the user accepted a notice version. Doing it twice is fine.
func (s *Store) Accept(ctx context.Context, userID, version string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `
		INSERT INTO privacy_notice_acceptances (user_id, version) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, userID, version)
	if err != nil {
		return err
	}

	_, err = s.db.Q(ctx).Exec(ctx, `UPDATE users SET agreed_to_terms = true WHERE id = $1`, userID)

	return err
}
