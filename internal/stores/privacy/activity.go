package privacy

import (
	"context"
	"encoding/json"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Activity is one line of the admin activity feed: a change to business data
// (source "audit") or a privacy event such as an export (source "privacy").
// Values are already masked by Postgres.
type Activity struct {
	Source      string          `json:"source"`
	ID          string          `json:"id"`
	At          time.Time       `json:"at"`
	ActorID     *string         `json:"actor_id"`
	ActorName   *string         `json:"actor_name"`
	ActorRole   *string         `json:"actor_role"`
	Table       string          `json:"table"`
	Action      string          `json:"action"`
	RowKey      json.RawMessage `json:"row_key"`
	OldValues   json.RawMessage `json:"old_values"`
	NewValues   json.RawMessage `json:"new_values"`
	SubjectName *string         `json:"subject_name"`
}

// ActivityFilter narrows the feed. An empty field means "any". From and To
// are South African calendar days, both included.
type ActivityFilter struct {
	Actor, Table, Action string
	From, To             string
	Like                 string
}

// Activity returns up to limit+1 feed lines, newest first. The two sources
// are joined here so one cursor pages through both.
func (s *Store) Activity(
	ctx context.Context,
	cur paging.Cursor,
	filter ActivityFilter,
	limit int,
) ([]Activity, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT f.source, f.sid, f.at, f.actor_id,
			CASE WHEN a.is_removed THEN 'Removed account'
				WHEN a.id IS NOT NULL THEN `+database.PersonName("a")+` END,
			CASE WHEN NOT a.is_removed THEN a.role END,
			f.table_name, f.action, f.row_key, f.old_values, f.new_values, f.subject_name
		FROM (
			SELECT 'audit' AS source, 'a' || lpad(l.id::text, 20, '0') AS sid, l.at,
				l.actor_id, l.table_name, l.action, l.row_key, l.old_values, l.new_values,
				NULL::text AS subject_name
			FROM audit_log l
			UNION ALL
			SELECT 'privacy', 'p' || e.id, e.created_at, e.actor_id, 'privacy_events', e.kind,
				jsonb_build_object('subject_id', e.subject_id), NULL::jsonb, e.details,
				CASE WHEN s.is_removed THEN 'Removed account'
					WHEN s.id IS NOT NULL THEN `+database.PersonName("s")+` ELSE c.name END
			FROM privacy_events e
			LEFT JOIN users s ON s.id = e.subject_id
			LEFT JOIN collectors c ON c.id = e.subject_id
		) f
		LEFT JOIN users a ON a.id = f.actor_id
		WHERE ($1::timestamptz IS NULL OR (f.at, f.sid) < ($1, $2))
			AND ($4 = '' OR f.actor_id = $4)
			AND ($5 = '' OR f.table_name = $5)
			AND ($6 = '' OR f.action = $6)
			AND ($7 = '' OR f.at >= (NULLIF($7,'')::date)::timestamp AT TIME ZONE 'Africa/Johannesburg')
			AND ($8 = '' OR f.at < ((NULLIF($8,'')::date) + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
			AND ($9 = '' OR `+database.PersonName("a")+` ILIKE $9)
		ORDER BY f.at DESC, f.sid DESC LIMIT $3`,
		cur.At, cur.ID, limit+1,
		filter.Actor, filter.Table, filter.Action, filter.From, filter.To, filter.Like)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Activity{}

	for rows.Next() {
		var line Activity

		if err := rows.Scan(&line.Source, &line.ID, &line.At, &line.ActorID, &line.ActorName,
			&line.ActorRole, &line.Table, &line.Action, &line.RowKey, &line.OldValues,
			&line.NewValues, &line.SubjectName); err != nil {
			return nil, err
		}

		out = append(out, line)
	}

	return out, rows.Err()
}
