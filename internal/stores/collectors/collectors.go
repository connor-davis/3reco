// Package collectors owns collector records and statistics SQL.
package collectors

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Collector is an explicit collector DTO. Services remove private fields when access is unprivileged.
type Collector struct {
	ID                    string    `json:"id"`
	CanEdit               bool      `json:"can_edit"`
	CanViewPayout         bool      `json:"can_view_payout"`
	Name                  string    `json:"name"`
	Email                 string    `json:"email,omitempty"`
	Phone                 string    `json:"phone,omitempty"`
	Image                 string    `json:"image"`
	BankAccountHolderName string    `json:"bank_account_holder_name,omitempty"`
	BankName              string    `json:"bank_name,omitempty"`
	BankAccountNumber     string    `json:"bank_account_number,omitempty"`
	BankBranchCode        string    `json:"bank_branch_code,omitempty"`
	BankAccountType       string    `json:"bank_account_type,omitempty"`
	PayoutMethod          string    `json:"payout_method,omitempty"`
	EwalletPlatformName   string    `json:"ewallet_platform_name,omitempty"`
	EwalletPaymentID      string    `json:"ewallet_payment_id,omitempty"`
	StreetAddress         string    `json:"street_address,omitempty"`
	City                  string    `json:"city"`
	Province              string    `json:"province"`
	AreaCode              *int      `json:"area_code,omitempty"`
	NormalizedPhone       string    `json:"-"`
	BankAccountLast4      string    `json:"-"`
	EwalletPaymentIDLast4 string    `json:"-"`
	CreatedByUserID       string    `json:"-"`
	CreatedByBusinessID   *string   `json:"-"`
	CreatedAt             time.Time `json:"created_at"`
}

// Store runs collector SQL.
type Store struct {
	db     *database.DB
	cipher *crypt.Cipher
}

// New builds the store. The cipher seals the account number and ewallet id.
func New(db *database.DB, cipher *crypt.Cipher) *Store { return &Store{db: db, cipher: cipher} }

// columnList is the collector SELECT list. The two payout numbers are
// ciphertext, so each caller says what to select for them: the sealed column,
// an empty string, or the column only when the viewer may read it in full.
func columnList(bank, ewallet string) string {
	return `id,COALESCE(name,''),COALESCE(email,''),COALESCE(phone,''),COALESCE(image,''),COALESCE(bank_account_holder_name,''),COALESCE(bank_name,''),` + bank + `,COALESCE(bank_branch_code,''),COALESCE(bank_account_type,''),COALESCE(payout_method,''),COALESCE(ewallet_platform_name,''),` + ewallet + `,COALESCE(street_address,''),COALESCE(city,''),COALESCE(province,''),
 area_code,COALESCE(normalized_phone,''),created_by_user_id,created_by_business_id,created_at,
 COALESCE(bank_account_last4,''),COALESCE(ewallet_payment_id_last4,'')`
}

// columns reads the sealed numbers, for writes and the owner's own export.
var columns = columnList(`COALESCE(bank_account_number,'')`, `COALESCE(ewallet_payment_id,'')`)

// listColumns never selects the sealed numbers: a list shows the last four.
var listColumns = columnList(`''`, `''`)

// Viewer is who is reading, so Postgres can decide whether the sealed payout
// numbers may leave the database. It repeats the service's full-access rule:
// an admin, a verified business, the creating business, or the collector's own
// login (OwnPhone).
type Viewer struct {
	ID       string
	Admin    bool
	Business bool
	Verified bool
	OwnPhone string
}

// gated selects a sealed column only for a viewer with full access, numbered
// from the first placeholder after the row id ($1).
func gated(column string) string {
	return `CASE WHEN ($3 OR ($4 AND ($5 OR created_by_business_id=$2)) OR
 ($6<>'' AND normalized_phone=$6)) THEN COALESCE(` + column + `,'') ELSE '' END`
}

// scan reads one row and opens the sealed fields, so a Collector always holds
// plain values. Services mask them for people who may not see the whole value.
func (records *Store) scan(row pgx.Row, item *Collector) error {
	err := row.Scan(
		&item.ID,
		&item.Name,
		&item.Email,
		&item.Phone,
		&item.Image,
		&item.BankAccountHolderName,
		&item.BankName,
		&item.BankAccountNumber,
		&item.BankBranchCode,
		&item.BankAccountType,
		&item.PayoutMethod,
		&item.EwalletPlatformName,
		&item.EwalletPaymentID,
		&item.StreetAddress,
		&item.City,
		&item.Province,
		&item.AreaCode,
		&item.NormalizedPhone,
		&item.CreatedByUserID,
		&item.CreatedByBusinessID,
		&item.CreatedAt,
		&item.BankAccountLast4,
		&item.EwalletPaymentIDLast4,
	)
	if err != nil {
		return err
	}

	if item.BankAccountNumber, err = records.cipher.Decrypt(item.BankAccountNumber); err != nil {
		return err
	}

	item.EwalletPaymentID, err = records.cipher.Decrypt(item.EwalletPaymentID)

	return err
}

// Find reads a collector with an optional edit lock.
func (records *Store) Find(ctx context.Context, id string, lock bool) (Collector, error) {
	query := `SELECT ` + columns + ` FROM collectors WHERE id=$1`
	if lock {
		query += ` FOR UPDATE`
	}

	var item Collector
	err := records.scan(records.db.Q(ctx).QueryRow(ctx, query, id), &item)

	return item, err
}

// FindFor reads a collector for a viewer. The sealed payout numbers only come
// out of Postgres when the viewer may read them in full.
func (records *Store) FindFor(ctx context.Context, id string, viewer Viewer) (Collector, error) {
	var item Collector

	err := records.scan(records.db.Q(ctx).QueryRow(ctx,
		`SELECT `+columnList(gated("bank_account_number"), gated("ewallet_payment_id"))+
			` FROM collectors WHERE id=$1`,
		id, viewer.ID, viewer.Admin, viewer.Business, viewer.Verified, viewer.OwnPhone), &item)

	return item, err
}

// After is the keyset position of the A to Z list: the last name and id seen.
// A nil *After means "from the start".
type After struct{ Name, ID string }

// searchTerms is the shared search predicate, given the placeholders each
// query numbers itself: like is the text pattern, phone the phone digits. A
// phone search matches any part of the stored number and still lets the text
// match, so a name or email search never loses rows. List and Count use the
// same terms, so the total always matches the rows.
func searchTerms(like, phone string) string {
	return strings.NewReplacer("{like}", like, "{phone}", phone).Replace(
		`({phone}<>'' AND regexp_replace(COALESCE(normalized_phone,''),'\D','','g') LIKE '%'||{phone}||'%')
 OR {like}='' OR name ILIKE {like} OR email ILIKE {like} OR phone ILIKE {like}
 OR normalized_phone ILIKE {like} OR city ILIKE {like} OR province ILIKE {like}`)
}

// Count returns every matching directory row, independent of the current cursor.
func (records *Store) Count(ctx context.Context, query paging.Query, phone string) (int, error) {
	var total int
	err := records.db.Q(ctx).QueryRow(ctx, `SELECT count(*) FROM collectors
		WHERE (`+searchTerms("$1", "$2")+`)`, query.Like, phone).Scan(&total)

	return total, err
}

// List retains the legacy managed directory, A to Z (or Z to A when desc) by
// name then id, so a cursor over (lower(name), id) never skips or repeats a
// row. Search runs in SQL before LIMIT. Services redact each row by scope.
func (records *Store) List(ctx context.Context, query paging.Query, after *After, phone string, desc bool) ([]Collector, error) {
	// Fixed SQL text, never built from input.
	past, order := ">", "lower(name),id"
	if desc {
		past, order = "<", "lower(name) DESC,id DESC"
	}

	var name, id *string
	if after != nil {
		name, id = &after.Name, &after.ID
	}

	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT `+listColumns+` FROM collectors
 WHERE ($1::text IS NULL OR (lower(name),id)`+past+`(lower($1::text),$2::text))
 AND (`+searchTerms("$4", "$5")+`)
 ORDER BY `+order+` LIMIT NULLIF($3,0)`,
		name,
		id,
		query.Size(),
		query.Like,
		phone,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Collector{}
	for rows.Next() {
		var item Collector
		if err := records.scan(rows, &item); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	return items, rows.Err()
}

// Created lists the collectors a user recorded, for their own data export. It
// reads in keyset pages so no single query holds every row; the export needs
// them all, so the pages are joined.
func (records *Store) Created(ctx context.Context, userID string) ([]Collector, error) {
	items := []Collector{}

	for {
		var cursor *time.Time

		afterID := ""
		if len(items) > 0 {
			last := items[len(items)-1]
			cursor, afterID = &last.CreatedAt, last.ID
		}

		page, err := records.createdPage(ctx, userID, cursor, afterID)
		if err != nil {
			return nil, err
		}

		items = append(items, page...)
		if len(page) < createdPageSize {
			return items, nil
		}
	}
}

const createdPageSize = 500

func (records *Store) createdPage(
	ctx context.Context,
	userID string,
	after *time.Time,
	afterID string,
) ([]Collector, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT `+columns+` FROM collectors
 WHERE ((created_by_user_id=$1 AND created_by_business_id IS NULL) OR created_by_business_id IN
 (SELECT business_id FROM business_members WHERE user_id=$1))
 AND ($2::timestamptz IS NULL OR (created_at,id)>($2,$3))
 ORDER BY created_at,id LIMIT $4`,
		userID,
		after,
		afterID,
		createdPageSize,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Collector{}
	for rows.Next() {
		var item Collector
		if err := records.scan(rows, &item); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	return items, rows.Err()
}

// PhoneConflict checks active business numbers, including legacy numbers without a canonical column.
func (records *Store) PhoneConflict(ctx context.Context, phone string) (bool, error) {
	var exists bool
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE role='business'
 AND NOT is_removed AND (normalized_phone=$1 OR
 regexp_replace(COALESCE(phone,''),'[^0-9]','','g')=substring($1 from 2) OR
 regexp_replace(COALESCE(phone,''),'[^0-9]','','g')='0'||substring($1 from 4)))`,
		phone,
	).Scan(
		&exists,
	)

	return exists, err
}

// EmailConflict tells whether another collector of the same creating business
// (or of no business, for staff-made ones) already has this email, ignoring case.
func (records *Store) EmailConflict(ctx context.Context, email string, business *string, except string) (bool, error) {
	var exists bool
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM collectors WHERE lower(email)=lower($1) AND id<>$2
 AND created_by_business_id IS NOT DISTINCT FROM $3::text)`,
		email,
		except,
		business,
	).Scan(
		&exists,
	)

	return exists, err
}

// Create records creator IDs supplied by the session.
func (records *Store) Create(ctx context.Context, item Collector) error {
	if err := records.seal(&item); err != nil {
		return err
	}

	_, err := records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO collectors(id,name,email,phone,image,bank_account_holder_name,bank_name,bank_account_number,bank_branch_code,bank_account_type,payout_method,ewallet_platform_name,ewallet_payment_id,street_address,city,province,
 normalized_phone,area_code,created_by_user_id,created_by_business_id,bank_account_last4,ewallet_payment_id_last4)
 VALUES($1,$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,''),NULLIF($12,''),NULLIF($13,''),NULLIF($14,''),NULLIF($15,''),NULLIF($16,''),
 NULLIF($17,''),$18,$19,$20,NULLIF($21,''),NULLIF($22,''))`,
		item.ID,
		item.Name,
		item.Email,
		item.Phone,
		item.Image,
		item.BankAccountHolderName,
		item.BankName,
		item.BankAccountNumber,
		item.BankBranchCode,
		item.BankAccountType,
		item.PayoutMethod,
		item.EwalletPlatformName,
		item.EwalletPaymentID,
		item.StreetAddress,
		item.City,
		item.Province,
		item.Phone,
		item.AreaCode,
		item.CreatedByUserID,
		item.CreatedByBusinessID,
		item.BankAccountLast4,
		item.EwalletPaymentIDLast4,
	)

	return err
}

// Save saves a previously locked collector.
func (records *Store) Save(ctx context.Context, item Collector) error {
	if err := records.seal(&item); err != nil {
		return err
	}

	_, err := records.db.Q(ctx).Exec(
		ctx,
		`UPDATE collectors SET
		name=$2,
		email=NULLIF($3,''),
		phone=NULLIF($4,''),
		image=NULLIF($5,''),
		bank_account_holder_name=NULLIF($6,''),
		bank_name=NULLIF($7,''),
		bank_account_number=NULLIF($8,''),
		bank_branch_code=NULLIF($9,''),
		bank_account_type=NULLIF($10,''),
		payout_method=NULLIF($11,''),
		ewallet_platform_name=NULLIF($12,''),
		ewallet_payment_id=NULLIF($13,''),
		street_address=NULLIF($14,''),
		city=NULLIF($15,''),
		province=NULLIF($16,''),
		normalized_phone=NULLIF($17,''),area_code=$18,
		bank_account_last4=NULLIF($19,''),ewallet_payment_id_last4=NULLIF($20,''),updated_at=now() WHERE id=$1`,
		item.ID,
		item.Name,
		item.Email,
		item.Phone,
		item.Image,
		item.BankAccountHolderName,
		item.BankName,
		item.BankAccountNumber,
		item.BankBranchCode,
		item.BankAccountType,
		item.PayoutMethod,
		item.EwalletPlatformName,
		item.EwalletPaymentID,
		item.StreetAddress,
		item.City,
		item.Province,
		item.Phone,
		item.AreaCode,
		item.BankAccountLast4,
		item.EwalletPaymentIDLast4,
	)

	return err
}

func (records *Store) seal(item *Collector) error {
	var err error

	item.BankAccountLast4 = Last4(item.BankAccountNumber)
	item.EwalletPaymentIDLast4 = Last4(item.EwalletPaymentID)

	if item.BankAccountNumber, err = records.cipher.Encrypt(item.BankAccountNumber); err != nil {
		return err
	}

	item.EwalletPaymentID, err = records.cipher.Encrypt(item.EwalletPaymentID)

	return err
}

// OwnPhone returns the canonical phone of a user, to find the collector record
// that belongs to their login.
func (records *Store) OwnPhone(ctx context.Context, userID string) (string, error) {
	var phone string
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT COALESCE(normalized_phone,'') FROM users WHERE id=$1 AND NOT is_removed`,
		userID,
	).Scan(&phone)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}

	return phone, err
}

// Delete removes the collector; historical transactions retain their snapshots.
func (records *Store) Delete(ctx context.Context, id string) error {
	_, err := records.db.Q(ctx).Exec(ctx, `DELETE FROM collectors WHERE id=$1`, id)

	return err
}

// ByPhone scopes phone lookups in SQL so an unrelated business cannot distinguish missing records.
func (records *Store) ByPhone(ctx context.Context, phone, creator string) (Collector, error) {
	if phone == "" {
		return Collector{}, pgx.ErrNoRows
	}

	var item Collector
	err := records.scan(
		records.db.Q(ctx).QueryRow(
			ctx,
			`SELECT `+columns+` FROM collectors
 WHERE normalized_phone=$1 AND ($2='' OR created_by_business_id=$2)`,
			phone,
			creator,
		),
		&item,
	)

	return item, err
}

// Last4 is the last four characters of a payout number, or nothing when the
// number is empty or too short to show any of it.
func Last4(plain string) string {
	runes := []rune(plain)
	if len(runes) <= 4 {
		return ""
	}

	return string(runes[len(runes)-4:])
}

// BackfillLast4 fills the last four digits of rows saved before the columns
// existed. It opens each sealed number, so it runs from Go at start-up; once
// every row has them it finds nothing. It returns how many rows it filled.
func (records *Store) BackfillLast4(ctx context.Context) (int, error) {
	rows, err := records.db.Q(ctx).Query(ctx, `
		SELECT id, COALESCE(bank_account_number,''), COALESCE(ewallet_payment_id,'')
		FROM collectors
		WHERE (bank_account_number IS NOT NULL AND bank_account_last4 IS NULL)
			OR (ewallet_payment_id IS NOT NULL AND ewallet_payment_id_last4 IS NULL)`)
	if err != nil {
		return 0, err
	}

	type fill struct{ id, bank, ewallet string }

	var fills []fill

	for rows.Next() {
		var id, bank, ewallet string

		if err := rows.Scan(&id, &bank, &ewallet); err != nil {
			rows.Close()

			return 0, err
		}

		if bank, err = records.cipher.Decrypt(bank); err != nil {
			rows.Close()

			return 0, err
		}

		if ewallet, err = records.cipher.Decrypt(ewallet); err != nil {
			rows.Close()

			return 0, err
		}

		fills = append(fills, fill{id, Last4(bank), Last4(ewallet)})
	}

	rows.Close()

	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, f := range fills {
		// '' (not NULL) marks "looked at, nothing to show", so the row is not found again.
		_, err := records.db.Q(ctx).Exec(ctx, `UPDATE collectors
			SET bank_account_last4=$2, ewallet_payment_id_last4=$3 WHERE id=$1`,
			f.id, f.bank, f.ewallet)
		if err != nil {
			return 0, err
		}
	}

	return len(fills), nil
}
