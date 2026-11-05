// Package profile owns private profile and safe directory SQL.
package profile

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
)

// Profile is the caller's editable profile, without credentials.
type Profile struct {
	ID                         string `json:"id"`
	Email                      string `json:"email"`
	Role                       string `json:"role"`
	Name                       string `json:"name"`
	Image                      string `json:"image"`
	Phone                      string `json:"phone"`
	FirstName                  string `json:"first_name"`
	LastName                   string `json:"last_name"`
	IDNumber                   string `json:"id_number"`
	BusinessName               string `json:"business_name"`
	BusinessRegistrationNumber string `json:"business_registration_number"`
	BankAccountHolderName      string `json:"bank_account_holder_name"`
	BankName                   string `json:"bank_name"`
	BankAccountNumber          string `json:"bank_account_number"`
	BankBranchCode             string `json:"bank_branch_code"`
	BankAccountType            string `json:"bank_account_type"`
	StreetAddress              string `json:"street_address"`
	City                       string `json:"city"`
	Province                   string `json:"province"`
	AreaCode                   *int   `json:"area_code"`
	ProfileComplete            bool   `json:"profile_complete"`
	AgreedToTerms              bool   `json:"agreed_to_terms"`
}

// PublicUser deliberately excludes contact, address and payout identifiers.
type PublicUser struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Image        string    `json:"image"`
	BusinessName string    `json:"business_name"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
}

// Store runs profile SQL.
type Store struct{ db *database.DB }

// New builds the store.
func New(db *database.DB) *Store { return &Store{db: db} }

// Find reads the caller's active profile and optionally locks it for PATCH.
func (records *Store) Find(ctx context.Context, id string, lock bool) (Profile, error) {
	query := `SELECT id,COALESCE(email,''),COALESCE(role,''),COALESCE(name,''),COALESCE(image,''),COALESCE(phone,''),COALESCE(first_name,''),COALESCE(last_name,''),COALESCE(id_number,''),COALESCE(business_name,''),COALESCE(business_registration_number,''),COALESCE(bank_account_holder_name,''),COALESCE(bank_name,''),COALESCE(bank_account_number,''),COALESCE(bank_branch_code,''),COALESCE(bank_account_type,''),COALESCE(street_address,''),COALESCE(city,''),COALESCE(province,''),
 area_code,profile_complete,agreed_to_terms FROM users WHERE id=$1 AND NOT is_removed`
	if lock {
		query += ` FOR UPDATE`
	}

	var item Profile
	err := records.db.Q(ctx).QueryRow(ctx, query, id).Scan(
		&item.ID,
		&item.Email,
		&item.Role,
		&item.Name,
		&item.Image,
		&item.Phone,
		&item.FirstName,
		&item.LastName,
		&item.IDNumber,
		&item.BusinessName,
		&item.BusinessRegistrationNumber,
		&item.BankAccountHolderName,
		&item.BankName,
		&item.BankAccountNumber,
		&item.BankBranchCode,
		&item.BankAccountType,
		&item.StreetAddress,
		&item.City,
		&item.Province,
		&item.AreaCode,
		&item.ProfileComplete,
		&item.AgreedToTerms,
	)

	return item, err
}

// Save changes only editable fields on the caller's row.
func (records *Store) Save(ctx context.Context, item Profile) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`UPDATE users SET
		name=$2,
		image=NULLIF($3,''),
		phone=NULLIF($4,''),
		first_name=NULLIF($5,''),
		last_name=NULLIF($6,''),
		id_number=NULLIF($7,''),
		business_name=NULLIF($8,''),
		business_registration_number=NULLIF($9,''),
		bank_account_holder_name=NULLIF($10,''),
		bank_name=NULLIF($11,''),
		bank_account_number=NULLIF($12,''),
		bank_branch_code=NULLIF($13,''),
		bank_account_type=NULLIF($14,''),
		street_address=NULLIF($15,''),
		city=NULLIF($16,''),
		province=NULLIF($17,''),
		area_code=$18,profile_complete=$19,agreed_to_terms=$20,
		normalized_phone=NULLIF($21,''),updated_at=now() WHERE id=$1 AND NOT is_removed`,
		item.ID,
		item.Name,
		item.Image,
		item.Phone,
		item.FirstName,
		item.LastName,
		item.IDNumber,
		item.BusinessName,
		item.BusinessRegistrationNumber,
		item.BankAccountHolderName,
		item.BankName,
		item.BankAccountNumber,
		item.BankBranchCode,
		item.BankAccountType,
		item.StreetAddress,
		item.City,
		item.Province,
		item.AreaCode,
		item.ProfileComplete,
		item.AgreedToTerms,
		item.Phone,
	)

	return err
}

// Public returns only allowlisted fields for an active user.
func (records *Store) Public(ctx context.Context, id string) (PublicUser, error) {
	var item PublicUser
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT id,name,COALESCE(image,''),COALESCE(business_name,''),
 COALESCE(role,''),created_at FROM users WHERE id=$1 AND NOT is_removed`,
		id,
	).Scan(
		&item.ID,
		&item.Name,
		&item.Image,
		&item.BusinessName,
		&item.Role,
		&item.CreatedAt,
	)

	return item, err
}

// Directory returns collector accounts with the same safe projection.
func (records *Store) Directory(ctx context.Context, query paging.Query) ([]PublicUser, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT id,name,COALESCE(image,''),COALESCE(business_name,''),
 role,created_at FROM users WHERE role='collector' AND NOT is_removed
 AND ($1='' OR (created_at,id)<($2,$1))
 ORDER BY created_at DESC,id DESC LIMIT NULLIF($3,0)`,
		query.ID,
		query.At,
		query.Size(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []PublicUser{}
	for rows.Next() {
		var item PublicUser
		if err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.Image,
			&item.BusinessName,
			&item.Role,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	return items, rows.Err()
}
