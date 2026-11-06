// Package privacy is the database access for privacy rights: the notice
// people accepted, the audit log, a person's own data export, erasure and the
// retention clean-up. SQL only; the rules live in services/privacy.
package privacy

import (
	"context"
	"encoding/json"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Event is one line of the audit log. Export entries include the selected
// download kind and filters so administrators can trace bulk reads.
type Event struct {
	ID        string    `json:"id"`
	ActorID   string    `json:"actor_id"`
	SubjectID *string   `json:"subject_id"`
	Kind      string    `json:"kind"`
	CreatedAt time.Time `json:"created_at"`

	// The names and roles are read now, from the account or collector the id
	// names, so an admin sees who it was. They are null when the id is gone.
	ActorName   *string         `json:"actor_name"`
	ActorRole   *string         `json:"actor_role"`
	SubjectName *string         `json:"subject_name"`
	SubjectRole *string         `json:"subject_role"`
	Details     json.RawMessage `json:"details"`
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

// RecordExport records the download kind and filters once streaming begins.
func (s *Store) RecordExport(ctx context.Context, actor, subject, kind string, filters map[string]string) error {
	details, err := json.Marshal(map[string]any{"export_kind": kind, "filters": filters})
	if err != nil {
		return err
	}

	_, err = s.db.Q(ctx).Exec(ctx, `INSERT INTO privacy_events
		(id,actor_id,subject_id,kind,details) VALUES ($1,$2,NULLIF($3,''),'export',$4::jsonb)`,
		database.NewID(), actor, subject, details)

	return err
}

// Events returns up to limit+1 audit lines, newest first.
func (s *Store) Events(ctx context.Context, cur paging.Cursor, limit int) ([]Event, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT e.id, e.actor_id, e.subject_id, e.kind, e.created_at,
			CASE WHEN a.is_removed THEN 'Removed account'
				WHEN a.id IS NOT NULL THEN `+database.PersonName("a")+` END,
			CASE WHEN NOT a.is_removed THEN a.role END,
			CASE WHEN s.is_removed THEN 'Removed account'
				WHEN s.id IS NOT NULL THEN `+database.PersonName("s")+` ELSE c.name END,
			CASE WHEN NOT s.is_removed THEN s.role WHEN c.id IS NOT NULL THEN 'collector' END,
			e.details
		FROM privacy_events e
		LEFT JOIN users a ON a.id = e.actor_id
		LEFT JOIN users s ON s.id = e.subject_id
		LEFT JOIN collectors c ON c.id = e.subject_id
		WHERE ($1::timestamptz IS NULL OR (e.created_at, e.id) < ($1, $2))
		ORDER BY e.created_at DESC, e.id DESC LIMIT $3`, cur.At, cur.ID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Event{}

	for rows.Next() {
		var e Event

		if err := rows.Scan(&e.ID, &e.ActorID, &e.SubjectID, &e.Kind, &e.CreatedAt,
			&e.ActorName, &e.ActorRole, &e.SubjectName, &e.SubjectRole, &e.Details); err != nil {
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
