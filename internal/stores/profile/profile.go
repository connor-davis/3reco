// Package profile owns private profile and safe directory SQL.
package profile

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/stores/collectors"
)

// Profile is the caller's editable profile, without credentials.
type Profile struct {
	ID                         string `json:"id"`
	BusinessID                 string `json:"-"`
	BusinessChanged            bool   `json:"-"`
	Email                      string `json:"email"`
	Role                       string `json:"role"`
	Name                       string `json:"name"`
	Image                      string `json:"image"`
	AvatarURL                  string `json:"avatar_url"`
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

	// The ID and account number are read masked ("•••• 1234") and never whole.
	// The service sets these two only when the caller typed a new full number.
	ReplaceIDNumber    bool `json:"-"`
	ReplaceBankAccount bool `json:"-"`
}

// PublicUser deliberately excludes contact, address and payout identifiers.
type PublicUser struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Image        string    `json:"image"`
	AvatarURL    string    `json:"avatar_url"`
	BusinessName string    `json:"business_name"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
}

// Store runs profile SQL.
type Store struct {
	db     *database.DB
	cipher *crypt.Cipher
}

// New builds the store. The cipher seals the ID and account numbers at rest.
func New(db *database.DB, cipher *crypt.Cipher) *Store { return &Store{db: db, cipher: cipher} }

// Find reads the caller's active profile and optionally locks it for PATCH.
func (records *Store) Find(ctx context.Context, id string, lock bool, business ...string) (Profile, error) {
	active := id
	if len(business) > 0 {
		active = business[0]
	}

	query := `SELECT u.id,
		COALESCE(u.email,''),
		u.role,
		u.name,
		COALESCE(u.image,''),
		CASE WHEN b.avatar_key IS NOT NULL THEN '/api/stores/'||b.id||'/logo' WHEN b.id IS NOT NULL THEN COALESCE(b.image,'') WHEN u.avatar_key IS NOT NULL THEN '/api/users/'||u.id||'/avatar' ELSE COALESCE(u.image,'') END,
		COALESCE(u.phone,''),
		COALESCE(u.first_name,''),
		COALESCE(u.last_name,''),
		mask_sealed(u.id_number,u.id_number_last4),
		COALESCE(b.business_name,''),
		COALESCE(b.business_registration_number,''),
		COALESCE(CASE WHEN b.id IS NOT NULL THEN b.bank_account_holder_name ELSE u.bank_account_holder_name END,''),
		COALESCE(CASE WHEN b.id IS NOT NULL THEN b.bank_name ELSE u.bank_name END,''),
		CASE WHEN b.id IS NOT NULL THEN mask_sealed(b.bank_account_number,b.bank_account_last4)
			ELSE mask_sealed(u.bank_account_number,u.bank_account_last4) END,
		COALESCE(CASE WHEN b.id IS NOT NULL THEN b.bank_branch_code ELSE u.bank_branch_code END,''),
		COALESCE(CASE WHEN b.id IS NOT NULL THEN b.bank_account_type ELSE u.bank_account_type END,''),
		COALESCE(CASE WHEN b.id IS NOT NULL THEN b.street_address ELSE u.street_address END,''),
		COALESCE(CASE WHEN b.id IS NOT NULL THEN b.city ELSE u.city END,''),
		COALESCE(CASE WHEN b.id IS NOT NULL THEN b.province ELSE u.province END,''),
		CASE WHEN b.id IS NOT NULL THEN b.area_code ELSE u.area_code END,
		u.profile_complete,
		u.agreed_to_terms,
		COALESCE(b.id,'')
		FROM users u LEFT JOIN businesses b ON b.id=$2
		AND EXISTS(SELECT 1 FROM business_members m WHERE m.business_id=b.id AND m.user_id=u.id)
		WHERE u.id=$1 AND NOT u.is_removed`
	if lock {
		query += ` FOR UPDATE OF u`
	}

	var item Profile
	err := records.db.Q(ctx).QueryRow(ctx, query, id, active).Scan(
		&item.ID,
		&item.Email,
		&item.Role,
		&item.Name,
		&item.Image,
		&item.AvatarURL,
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
		&item.BusinessID,
	)


	return item, err
}

// Save changes only editable fields on the caller's row.
func (records *Store) Save(ctx context.Context, item Profile) error {
	idNumber, err := records.cipher.Encrypt(item.IDNumber)
	if err != nil {
		return err
	}

	account, err := records.cipher.Encrypt(item.BankAccountNumber)
	if err != nil {
		return err
	}

	idLast4, accountLast4 := collectors.Last4(item.IDNumber), collectors.Last4(item.BankAccountNumber)

	_, err = records.db.Q(ctx).Exec(ctx, `UPDATE users SET
		name=$2,
		image=NULLIF($3,''),
		phone=NULLIF($4,''),
		first_name=NULLIF($5,''),
		last_name=NULLIF($6,''),
		id_number=CASE WHEN $11 THEN NULLIF($7,'') ELSE id_number END,
		id_number_last4=CASE WHEN $11 THEN NULLIF($12,'') ELSE id_number_last4 END,
		profile_complete=$8,
		agreed_to_terms=$9,
		normalized_phone=NULLIF($10,''), updated_at=now() WHERE id=$1 AND NOT is_removed`,
		item.ID, item.Name, item.Image, item.Phone, item.FirstName, item.LastName, idNumber, item.ProfileComplete, item.AgreedToTerms, item.Phone,
		item.ReplaceIDNumber, idLast4)
	if err != nil {
		return err
	}

	if item.BusinessID != "" {
		if item.BusinessChanged {
			return records.saveBusiness(ctx, item, account, accountLast4)
		}

		return nil
	}

	if item.BusinessName != "" || item.BusinessRegistrationNumber != "" {
		return records.saveBusiness(ctx, item, account, accountLast4)
	}

	_, err = records.db.Q(ctx).Exec(ctx, `UPDATE users SET
		bank_account_holder_name=NULLIF($2,''),
		bank_name=NULLIF($3,''),
		bank_account_number=CASE WHEN $11 THEN NULLIF($4,'') ELSE bank_account_number END,
		bank_account_last4=CASE WHEN $11 THEN NULLIF($12,'') ELSE bank_account_last4 END,
		bank_branch_code=NULLIF($5,''),
		bank_account_type=NULLIF($6,''),
		street_address=NULLIF($7,''),
		city=NULLIF($8,''),
		province=NULLIF($9,''),
		area_code=$10, updated_at=now() WHERE id=$1`,
		item.ID, item.BankAccountHolderName, item.BankName, account, item.BankBranchCode, item.BankAccountType, item.StreetAddress, item.City, item.Province, item.AreaCode,
		item.ReplaceBankAccount, accountLast4)

	return err
}

func (records *Store) saveBusiness(ctx context.Context, item Profile, account, accountLast4 string) error {
	id := item.BusinessID
	if id == "" {
		id = item.ID
	}

	_, err := records.db.Q(ctx).Exec(ctx, `INSERT INTO businesses
		(id,business_name,business_registration_number,bank_account_holder_name,bank_name,bank_account_number,bank_branch_code,bank_account_type,street_address,city,province,area_code,image,bank_account_last4)
		VALUES ($1,NULLIF($2,''),NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,''),$12,(SELECT image FROM users WHERE id=$1),NULLIF($14,''))
		ON CONFLICT(id) DO UPDATE SET
		business_name=EXCLUDED.business_name,
		business_registration_number=EXCLUDED.business_registration_number,
		bank_account_holder_name=EXCLUDED.bank_account_holder_name,
		bank_name=EXCLUDED.bank_name,
		bank_account_number=CASE WHEN $13 THEN EXCLUDED.bank_account_number ELSE businesses.bank_account_number END,
		bank_account_last4=CASE WHEN $13 THEN EXCLUDED.bank_account_last4 ELSE businesses.bank_account_last4 END,
		bank_branch_code=EXCLUDED.bank_branch_code,
		bank_account_type=EXCLUDED.bank_account_type,
		street_address=EXCLUDED.street_address,
		city=EXCLUDED.city,
		province=EXCLUDED.province,
		area_code=EXCLUDED.area_code, updated_at=now()`,
		id, item.BusinessName, item.BusinessRegistrationNumber,
		item.BankAccountHolderName, item.BankName, account, item.BankBranchCode, item.BankAccountType, item.StreetAddress, item.City, item.Province, item.AreaCode, item.ReplaceBankAccount, accountLast4)
	if err != nil || item.BusinessID != "" {
		return err
	}

	_, err = records.db.Q(ctx).Exec(ctx, `INSERT INTO business_members VALUES($1,$2,'owner')
		ON CONFLICT DO NOTHING`, id, item.ID)

	return err
}

// BackfillLast4 fills the last four digits of ID and account numbers saved
// before the columns existed. It opens each sealed number, so it runs from Go
// at start-up; once every row has them it finds nothing. It returns the rows
// filled.
func (records *Store) BackfillLast4(ctx context.Context) (int, error) {
	filled := 0

	for _, target := range []struct{ table, number, last4 string }{
		{"users", "id_number", "id_number_last4"},
		{"users", "bank_account_number", "bank_account_last4"},
		{"businesses", "bank_account_number", "bank_account_last4"},
	} {
		count, err := records.backfillColumn(ctx, target.table, target.number, target.last4)
		if err != nil {
			return filled, err
		}

		filled += count
	}

	return filled, nil
}

// backfillColumn fixes one sealed column. The names are fixed in BackfillLast4,
// never user input.
func (records *Store) backfillColumn(ctx context.Context, table, number, last4 string) (int, error) {
	rows, err := records.db.Q(ctx).Query(ctx,
		`SELECT id, `+number+` FROM `+table+` WHERE `+number+` IS NOT NULL AND `+last4+` IS NULL`)
	if err != nil {
		return 0, err
	}

	fills := map[string]string{}

	for rows.Next() {
		var id, sealed string

		if err := rows.Scan(&id, &sealed); err != nil {
			rows.Close()

			return 0, err
		}

		plain, err := records.cipher.Decrypt(sealed)
		if err != nil {
			rows.Close()

			return 0, err
		}

		fills[id] = collectors.Last4(plain)
	}

	rows.Close()

	if err := rows.Err(); err != nil {
		return 0, err
	}

	for id, last := range fills {
		// '' (not NULL) marks "looked at, nothing to show", so it is not found again.
		_, err := records.db.Q(ctx).Exec(ctx,
			`UPDATE `+table+` SET `+last4+`=$2 WHERE id=$1`, id, last)
		if err != nil {
			return 0, err
		}
	}

	return len(fills), nil
}

// Public returns only allowlisted fields for an active user.
func (records *Store) Public(ctx context.Context, id string) (PublicUser, error) {
	var item PublicUser
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT id,name,COALESCE(image,''),CASE WHEN avatar_key IS NOT NULL THEN '/api/users/'||id||'/avatar' ELSE COALESCE(image,'') END,COALESCE((SELECT b.business_name FROM businesses b WHERE b.id=users.id),''),
 COALESCE(role,''),created_at FROM users WHERE id=$1 AND NOT is_removed`,
		id,
	).Scan(
		&item.ID,
		&item.Name,
		&item.Image,
		&item.AvatarURL,
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
		`SELECT id,name,COALESCE(image,''),CASE WHEN avatar_key IS NOT NULL THEN '/api/users/'||id||'/avatar' ELSE COALESCE(image,'') END,COALESCE((SELECT b.business_name FROM businesses b WHERE b.id=users.id),''),
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
			&item.AvatarURL,
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

// Finish marks the profile complete and, when role is not empty, gives a guest
// that role. It changes nothing for anyone who is not a guest.
func (records *Store) Finish(ctx context.Context, id, role string) error {
	tag, err := records.db.Q(ctx).Exec(ctx, `
		UPDATE users SET role = COALESCE(NULLIF($2, ''), role), profile_complete = true,
			updated_at = now()
		WHERE id = $1 AND NOT is_removed AND ($2 = '' OR role = 'guest')`, id, role)
	if err != nil {
		return err
	}

	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}

	return nil
}
