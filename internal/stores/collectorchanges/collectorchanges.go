// Package collectorchanges owns the waiting edits to collectors that another
// business proposed. SQL only; the rules live in the services.
package collectorchanges

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/internal/platform/database"
	collectors "github.com/connor-davis/3reco/internal/stores/collectors"
)

// Fields is a set of optional collector fields. A nil field is "not part of
// this edit"; an empty string clears the field. It is the body of a collector
// PATCH and, saved, the proposed values of a waiting change.
type Fields struct {
	Name                  *string `json:"name"`
	Email                 *string `json:"email"`
	Phone                 *string `json:"phone"`
	Image                 *string `json:"image"`
	BankAccountHolderName *string `json:"bank_account_holder_name"`
	BankName              *string `json:"bank_name"`
	BankAccountNumber     *string `json:"bank_account_number"`
	BankBranchCode        *string `json:"bank_branch_code"`
	BankAccountType       *string `json:"bank_account_type"`
	PayoutMethod          *string `json:"payout_method"`
	EwalletPlatformName   *string `json:"ewallet_platform_name"`
	EwalletPaymentID      *string `json:"ewallet_payment_id"`
	StreetAddress         *string `json:"street_address"`
	City                  *string `json:"city"`
	Province              *string `json:"province"`
	AreaCode              *int    `json:"area_code"`
}

// TextColumns names the text fields in a fixed order, matching Text.
var TextColumns = []string{
	"name", "email", "phone", "image", "bank_account_holder_name", "bank_name",
	"bank_account_number", "bank_branch_code", "bank_account_type", "payout_method",
	"ewallet_platform_name", "ewallet_payment_id", "street_address", "city", "province",
}

// Text lists the address of every text field, in the order of TextColumns.
func (fields *Fields) Text() []**string {
	return []**string{
		&fields.Name, &fields.Email, &fields.Phone, &fields.Image,
		&fields.BankAccountHolderName, &fields.BankName, &fields.BankAccountNumber,
		&fields.BankBranchCode, &fields.BankAccountType, &fields.PayoutMethod,
		&fields.EwalletPlatformName, &fields.EwalletPaymentID, &fields.StreetAddress,
		&fields.City, &fields.Province,
	}
}

// Change is one proposed edit, with the values opened (not sealed).
type Change struct {
	ID           string
	CollectorID  string
	BusinessID   string
	ActingUserID *string
	Status       string
	CreatedAt    time.Time
	Fields
}

// Store runs the collector change SQL.
type Store struct {
	db     *database.DB
	cipher *crypt.Cipher
}

// New builds the store. The cipher seals the two payout numbers, like the
// collector's own.
func New(db *database.DB, cipher *crypt.Cipher) *Store { return &Store{db: db, cipher: cipher} }

// sealed are the columns whose values are encrypted at rest.
var sealed = map[string]bool{"bank_account_number": true, "ewallet_payment_id": true}

// columnList is every proposed-value column, in a fixed order: the text
// fields, the area code, then the two last-four columns.
var columnList = strings.Join(TextColumns, ",") + ",area_code,bank_account_last4,ewallet_payment_id_last4"

// Replace saves a proposal as the business's one waiting request for the
// collector. An older waiting request from the same business is marked
// replaced first, so the log keeps both.
func (store *Store) Replace(ctx context.Context, change Change) error {
	_, err := store.db.Q(ctx).Exec(ctx,
		`UPDATE collector_changes SET status='replaced', resolved_at=now()
		 WHERE collector_id=$1 AND business_id=$2 AND status='pending'`,
		change.CollectorID, change.BusinessID)
	if err != nil {
		return err
	}

	// NULL means "untouched", so a nil field must stay NULL; only a sent
	// value (even an empty one) is written. Payout numbers are sealed first.
	args := []any{change.ID, change.CollectorID, change.BusinessID, change.ActingUserID}
	holders := []string{"$1", "$2", "$3", "$4"}

	for i, field := range change.Text() {
		var value any

		if *field != nil {
			text := **field

			if sealed[TextColumns[i]] {
				if text, err = store.cipher.Encrypt(text); err != nil {
					return err
				}
			}

			value = text
		}

		args = append(args, value)
		holders = append(holders, "$"+strconv.Itoa(len(args)))
	}

	args = append(args, change.AreaCode,
		last4(change.BankAccountNumber), last4(change.EwalletPaymentID))
	for _, n := range []int{len(args) - 2, len(args) - 1, len(args)} {
		holders = append(holders, "$"+strconv.Itoa(n))
	}

	_, err = store.db.Q(ctx).Exec(ctx,
		`INSERT INTO collector_changes (id,collector_id,business_id,acting_user_id,`+columnList+`)
		 VALUES (`+strings.Join(holders, ",")+`)`, args...)

	return err
}

// last4 is the last four digits to keep beside a sealed number, or nil when
// the number is not part of the change.
func last4(number *string) any {
	if number == nil {
		return nil
	}

	return collectors.Last4(*number)
}

// scan reads one change row (see changeSelect) and opens the sealed numbers.
func (store *Store) scan(row interface{ Scan(...any) error }, change *Change) error {
	var bankLast4, walletLast4 *string

	dest := []any{
		&change.ID, &change.CollectorID, &change.BusinessID, &change.ActingUserID,
		&change.Status, &change.CreatedAt,
	}

	for _, field := range change.Text() {
		dest = append(dest, field)
	}

	dest = append(dest, &change.AreaCode, &bankLast4, &walletLast4)

	if err := row.Scan(dest...); err != nil {
		return err
	}

	for _, field := range []**string{&change.BankAccountNumber, &change.EwalletPaymentID} {
		if *field == nil {
			continue
		}

		plain, err := store.cipher.Decrypt(**field)
		if err != nil {
			return err
		}

		*field = &plain
	}

	return nil
}

const changeSelect = `SELECT id,collector_id,business_id,acting_user_id,status,created_at,`

// Lock reads one change and holds it until the transaction ends, so two
// reviewers cannot both resolve it.
func (store *Store) Lock(ctx context.Context, id string) (Change, error) {
	var change Change

	err := store.scan(store.db.Q(ctx).QueryRow(ctx,
		changeSelect+columnList+` FROM collector_changes WHERE id=$1 FOR UPDATE`, id), &change)

	return change, err
}

// Pending lists every waiting change, oldest first, for the staff queue. It
// stops at 200: the queue is worked down, so the rest show once these clear.
func (store *Store) Pending(ctx context.Context) ([]Change, error) {
	rows, err := store.db.Q(ctx).Query(ctx,
		changeSelect+columnList+` FROM collector_changes WHERE status='pending'
		 ORDER BY created_at,id LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Change{}

	for rows.Next() {
		var change Change
		if err := store.scan(rows, &change); err != nil {
			return nil, err
		}

		out = append(out, change)
	}

	return out, rows.Err()
}

// Resolve closes a locked change as approved or rejected and records who and why.
func (store *Store) Resolve(ctx context.Context, id, status, actor, reason string) error {
	_, err := store.db.Q(ctx).Exec(ctx,
		`UPDATE collector_changes SET status=$2,resolved_by=$3,reason=$4,resolved_at=now()
		 WHERE id=$1`, id, status, actor, reason)

	return err
}

// PendingFor tells which of the collectors have a change from this business
// still waiting.
func (store *Store) PendingFor(ctx context.Context, business string, ids []string) (map[string]bool, error) {
	rows, err := store.db.Q(ctx).Query(ctx,
		`SELECT collector_id FROM collector_changes
		 WHERE business_id=$1 AND status='pending' AND collector_id=ANY($2)`, business, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	waiting := map[string]bool{}

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		waiting[id] = true
	}

	return waiting, rows.Err()
}

// Reviewers are the people who hear the outcome: the business's Owners and
// Managers who still have an account.
func (store *Store) Reviewers(ctx context.Context, business string) ([]string, error) {
	rows, err := store.db.Q(ctx).Query(ctx,
		`SELECT m.user_id FROM business_members m JOIN users u ON u.id=m.user_id
		 WHERE m.business_id=$1 AND m.role IN ('owner','manager') AND NOT u.is_removed
		 ORDER BY m.user_id`, business)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []string

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		users = append(users, id)
	}

	return users, rows.Err()
}

// BusinessNames maps business ids to the name staff see.
func (store *Store) BusinessNames(ctx context.Context, ids []string) (map[string]string, error) {
	rows, err := store.db.Q(ctx).Query(ctx,
		`SELECT id, COALESCE(NULLIF(business_name,''),'Business') FROM businesses WHERE id=ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	names := map[string]string{}

	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}

		names[id] = name
	}

	return names, rows.Err()
}
