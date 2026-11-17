// Package moderation owns reports, business blocks and contact eligibility SQL.
package moderation

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Store runs moderation queries inside the caller's transaction.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// ContactAllowed checks both block directions and either party's suspension.
func ContactAllowed(ctx context.Context, db *database.DB, left, right string) (bool, error) {
	var allowed bool
	err := db.Q(ctx).QueryRow(ctx, `SELECT contact_allowed($1,$2)`, left, right).Scan(&allowed)

	return allowed, err
}

// Block is a caller-owned block, including a safe display name.
type Block struct {
	ID      string `json:"id"`
	PartyID string `json:"party_id"`
	Name    string `json:"name"`
}

// Blocks returns only the active business's outgoing blocks.
func (s *Store) Blocks(ctx context.Context, party string) ([]Block, error) {
	rows, err := s.db.Q(ctx).Query(
		ctx,
		`SELECT b.id,b.blocked_id,`+database.DisplayName("u")+`
		FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1
		ORDER BY b.created_at DESC,b.id`,
		party,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Block{}
	for rows.Next() {
		var item Block
		if err := rows.Scan(&item.ID, &item.PartyID, &item.Name); err != nil {
			return nil, err
		}
		out = append(out, item)
	}

	return out, rows.Err()
}

// Exists checks an active target business without exposing a private profile.
func (s *Store) Exists(ctx context.Context, party string) (bool, error) {
	var exists bool
	err := s.db.Q(ctx).QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM businesses WHERE id=$1 AND NOT is_removed)`,
		party,
	).Scan(&exists)

	return exists, err
}

// Block adds an outgoing block once.
func (s *Store) Block(ctx context.Context, party, target, actor string) error {
	_, err := s.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO blocks(id,blocker_id,blocked_id,acting_user_id)
		VALUES($1,$2,$3,$4) ON CONFLICT(blocker_id,blocked_id) DO NOTHING`,
		database.NewID(),
		party,
		target,
		actor,
	)

	return err
}

// Unblock removes only a block made by this business.
func (s *Store) Unblock(ctx context.Context, party, target string) error {
	_, err := s.db.Q(ctx).Exec(
		ctx,
		`DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2`,
		party,
		target,
	)

	return err
}

// Report is the private admin projection. Reporters receive only ReportStatus.
type Report struct {
	ID         string    `json:"id"`
	ReporterID string    `json:"reporter_id"`
	PartyID    string    `json:"party_id"`
	PartyName  string    `json:"party_name"`
	TargetKind string    `json:"target_kind"`
	TargetID   string    `json:"target_id"`
	TargetName string    `json:"target_name"`
	Reason     string    `json:"reason"`
	Details    string    `json:"details"`
	Status     string    `json:"status"`
	Suspended  bool      `json:"suspended"`
	CreatedAt  time.Time `json:"created_at"`
}

// ReportStatus exposes only the caller's report id and status.
type ReportStatus struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// Mine returns no report text or target information.
func (s *Store) Mine(ctx context.Context, party string) ([]ReportStatus, error) {
	rows, err := s.db.Q(ctx).Query(
		ctx,
		`SELECT id,status FROM reports WHERE reporter_id=$1 ORDER BY created_at DESC,id`,
		party,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ReportStatus{}
	for rows.Next() {
		var item ReportStatus
		if err := rows.Scan(&item.ID, &item.Status); err != nil {
			return nil, err
		}
		out = append(out, item)
	}

	return out, rows.Err()
}

// TargetParty resolves a listing's owner, or checks a party target.
func (s *Store) TargetParty(ctx context.Context, kind, id string) (string, error) {
	var party string
	query := `SELECT id FROM businesses WHERE id=$1 AND NOT is_removed`
	if kind == "listing" {
		query = `SELECT owner_id FROM stock WHERE id=$1`
	}
	err := s.db.Q(ctx).QueryRow(ctx, query, id).Scan(&party)

	return party, err
}

// CreateReport keeps the acting person and target snapshot private.
func (s *Store) CreateReport(ctx context.Context, id, reporter, actor, kind, target, party, reason, details string) error {
	_, err := s.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO reports
		(id,reporter_id,acting_user_id,target_kind,target_id,party_id,listing_id,reason,details)
		VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $4='listing' THEN $5 END,$7,$8)`,
		id,
		reporter,
		actor,
		kind,
		target,
		party,
		reason,
		details,
	)

	return err
}

// Queue lists open reports first and includes suspension state for reversal.
func (s *Store) Queue(ctx context.Context) ([]Report, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT r.id,r.reporter_id,r.party_id,r.target_kind,r.target_id,
		r.reason,r.details,r.status,b.suspended_at IS NOT NULL,r.created_at,
		COALESCE(NULLIF(b.business_name,''),'Business'),
		CASE WHEN r.target_kind='listing' THEN COALESCE(m.name,'Listing no longer available')
		ELSE COALESCE(NULLIF(b.business_name,''),'Business') END
		FROM reports r JOIN businesses b ON b.id=r.party_id
		LEFT JOIN stock s ON s.id=r.listing_id LEFT JOIN materials m ON m.id=s.material_id
		ORDER BY (r.status='open') DESC,r.created_at DESC,r.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Report{}
	for rows.Next() {
		var item Report
		if err := rows.Scan(
			&item.ID,
			&item.ReporterID,
			&item.PartyID,
			&item.TargetKind,
			&item.TargetID,
			&item.Reason,
			&item.Details,
			&item.Status,
			&item.Suspended,
			&item.CreatedAt,
			&item.PartyName,
			&item.TargetName,
		); err != nil {
			return nil, err
		}
		out = append(out, item)
	}

	return out, rows.Err()
}

// LockReport serializes admin outcomes so a report closes once.
func (s *Store) LockReport(ctx context.Context, id string) (Report, error) {
	var item Report
	err := s.db.Q(ctx).QueryRow(
		ctx,
		`SELECT id,reporter_id,party_id,target_kind,target_id,status
		FROM reports WHERE id=$1 FOR UPDATE`,
		id,
	).Scan(&item.ID, &item.ReporterID, &item.PartyID, &item.TargetKind, &item.TargetID, &item.Status)

	return item, err
}

// CloseReport records the reviewer and final status.
func (s *Store) CloseReport(ctx context.Context, id, actor, status string) error {
	_, err := s.db.Q(ctx).Exec(
		ctx,
		`UPDATE reports SET status=$3,closed_by=$2,closed_at=now() WHERE id=$1`,
		id,
		actor,
		status,
	)

	return err
}

// RemoveListing unlists the reported row through the admin-only service.
func (s *Store) RemoveListing(ctx context.Context, id string) error {
	_, err := s.db.Q(ctx).Exec(
		ctx,
		`UPDATE stock SET is_listed=false,updated_at=now() WHERE id=$1`,
		id,
	)

	return err
}

// Suspend changes contact eligibility without revoking sign-in or history access.
func (s *Store) Suspend(ctx context.Context, party, actor string, suspended bool) error {
	_, err := s.db.Q(ctx).Exec(
		ctx,
		`UPDATE businesses SET
		suspended_at=CASE WHEN $3 THEN now() END,suspended_by=CASE WHEN $3 THEN $2::text END
		WHERE id=$1`,
		party,
		actor,
		suspended,
	)

	return err
}

// AuditAction logs every explicit admin decision, including a repeated unsuspend.
func (s *Store) AuditAction(ctx context.Context, actor, id, action string) error {
	_, err := s.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO audit_log(actor_id,table_name,row_key,action,new_values)
		VALUES(NULLIF($1,''),'moderation_action',jsonb_build_object('id',$2::text),'update',
		jsonb_build_object('action',$3::text))`,
		actor,
		id,
		action,
	)

	return err
}
