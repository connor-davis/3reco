package businesses

import (
	"context"
)

// Profile is a business's own details: name, registration, bank and location.
// The account number is read masked ("•••• 1234") and never whole.
type Profile struct {
	ID                         string `json:"id"`
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
	AvatarURL                  string `json:"avatar_url"`
	CanEdit                    bool   `json:"can_edit"`

	// The service sets this only when the Owner typed a new full number.
	ReplaceBankAccount bool `json:"-"`
}

// FindProfile reads one active business. Postgres masks the account number, so
// no whole number reaches Go. lock holds the row for a PATCH.
func (s *Store) FindProfile(ctx context.Context, id string, lock bool) (Profile, error) {
	query := `SELECT id,
		COALESCE(business_name,''),
		COALESCE(business_registration_number,''),
		COALESCE(bank_account_holder_name,''),
		COALESCE(bank_name,''),
		mask_sealed(bank_account_number,bank_account_last4),
		COALESCE(bank_branch_code,''),
		COALESCE(bank_account_type,''),
		COALESCE(street_address,''),
		COALESCE(city,''),
		COALESCE(province,''),
		area_code,
		CASE WHEN avatar_key IS NOT NULL THEN '/api/stores/'||id||'/logo' ELSE COALESCE(image,'') END
		FROM businesses WHERE id=$1 AND NOT is_removed`
	if lock {
		query += ` FOR UPDATE`
	}

	var item Profile
	err := s.db.Q(ctx).QueryRow(ctx, query, id).Scan(
		&item.ID,
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
		&item.AvatarURL,
	)

	return item, err
}

// SaveProfile writes the business's details. sealed and last4 are the new
// account number, used only when ReplaceBankAccount is set.
func (s *Store) SaveProfile(ctx context.Context, item Profile, sealed, last4 string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE businesses SET
		business_name=NULLIF($2,''),
		business_registration_number=NULLIF($3,''),
		bank_account_holder_name=NULLIF($4,''),
		bank_name=NULLIF($5,''),
		bank_account_number=CASE WHEN $13 THEN NULLIF($6,'') ELSE bank_account_number END,
		bank_account_last4=CASE WHEN $13 THEN NULLIF($14,'') ELSE bank_account_last4 END,
		bank_branch_code=NULLIF($7,''),
		bank_account_type=NULLIF($8,''),
		street_address=NULLIF($9,''),
		city=NULLIF($10,''),
		province=NULLIF($11,''),
		area_code=$12,
		updated_at=now()
		WHERE id=$1 AND NOT is_removed`,
		item.ID, item.BusinessName, item.BusinessRegistrationNumber, item.BankAccountHolderName,
		item.BankName, sealed, item.BankBranchCode, item.BankAccountType, item.StreetAddress,
		item.City, item.Province, item.AreaCode, item.ReplaceBankAccount, last4)

	return err
}

// HasBusiness reports whether the person already belongs to a business or has
// a business row under their own id. Either one means they cannot open another.
func (s *Store) HasBusiness(ctx context.Context, userID string) (bool, error) {
	var found bool
	err := s.db.Q(ctx).QueryRow(ctx, `SELECT
		EXISTS(SELECT 1 FROM business_members WHERE user_id=$1) OR
		EXISTS(SELECT 1 FROM businesses WHERE id=$1)`, userID).Scan(&found)

	return found, err
}

// Open creates the person's business (its id is theirs) and makes them its
// Owner, in the caller's transaction. It starts empty, keeping only the
// person's old picture URL.
func (s *Store) Open(ctx context.Context, ownerID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `INSERT INTO businesses (id,image)
		SELECT id,image FROM users WHERE id=$1`, ownerID)
	if err != nil {
		return err
	}

	_, err = s.db.Q(ctx).Exec(ctx, `INSERT INTO business_members VALUES($1,$1,'owner')`, ownerID)

	return err
}
