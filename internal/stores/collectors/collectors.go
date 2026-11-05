// Package collectors owns collector records and statistics SQL.
package collectors

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Collector is an explicit collector DTO. Services remove private fields when access is unprivileged.
type Collector struct {
	ID                    string    `json:"id"`
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
	CreatedByUserID       string    `json:"-"`
	CreatedByBusinessID   *string   `json:"-"`
	CreatedAt             time.Time `json:"created_at"`
}

// Store runs collector SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

const columns = `id,COALESCE(name,''),COALESCE(email,''),COALESCE(phone,''),COALESCE(image,''),COALESCE(bank_account_holder_name,''),COALESCE(bank_name,''),COALESCE(bank_account_number,''),COALESCE(bank_branch_code,''),COALESCE(bank_account_type,''),COALESCE(payout_method,''),COALESCE(ewallet_platform_name,''),COALESCE(ewallet_payment_id,''),COALESCE(street_address,''),COALESCE(city,''),COALESCE(province,''),
 area_code,created_by_user_id,created_by_business_id,created_at`

func scan(row pgx.Row, item *Collector) error {
	return row.Scan(
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
		&item.CreatedByUserID,
		&item.CreatedByBusinessID,
		&item.CreatedAt,
	)
}

// Find reads a collector with an optional edit lock.
func (records *Store) Find(ctx context.Context, id string, lock bool) (Collector, error) {
	query := `SELECT ` + columns + ` FROM collectors WHERE id=$1`
	if lock {
		query += ` FOR UPDATE`
	}

	var item Collector
	err := scan(records.db.Q(ctx).QueryRow(ctx, query, id), &item)

	return item, err
}

// List retains the legacy managed directory; services redact each row by scope.
func (records *Store) List(ctx context.Context, query paging.Query) ([]Collector, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT `+columns+` FROM collectors
 WHERE ($1='' OR (created_at,id)<($2,$1))
 ORDER BY created_at DESC,id DESC LIMIT NULLIF($3,0)`,
		query.ID,
		query.At,
		query.Size(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Collector{}
	for rows.Next() {
		var item Collector
		if err := scan(rows, &item); err != nil {
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

// Create records creator IDs supplied by the session.
func (records *Store) Create(ctx context.Context, item Collector) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO collectors(id,name,email,phone,image,bank_account_holder_name,bank_name,bank_account_number,bank_branch_code,bank_account_type,payout_method,ewallet_platform_name,ewallet_payment_id,street_address,city,province,
 normalized_phone,area_code,created_by_user_id,created_by_business_id)
 VALUES($1,$2,NULLIF($3,''),$4,NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,''),NULLIF($12,''),NULLIF($13,''),NULLIF($14,''),NULLIF($15,''),NULLIF($16,''),
 $17,$18,$19,$20)`,
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
	)

	return err
}

// Save saves a previously locked collector.
func (records *Store) Save(ctx context.Context, item Collector) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`UPDATE collectors SET
		name=$2,
		email=NULLIF($3,''),
		phone=$4,
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
		normalized_phone=$17,area_code=$18,updated_at=now() WHERE id=$1`,
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
	)

	return err
}

// Delete removes the collector; historical transactions retain their snapshots.
func (records *Store) Delete(ctx context.Context, id string) error {
	_, err := records.db.Q(ctx).Exec(ctx, `DELETE FROM collectors WHERE id=$1`, id)

	return err
}

// ByPhone scopes phone lookups in SQL so an unrelated business cannot distinguish missing records.
func (records *Store) ByPhone(ctx context.Context, phone, creator string) (Collector, error) {
	var item Collector
	err := scan(
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
