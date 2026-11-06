package transactions

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// Contact is the private profile projection used only for invoices and authorized exports.
type Contact struct {
	Name         string `json:"name"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	BusinessName string `json:"business_name"`
	Email        string `json:"email"`
	Phone        string `json:"phone"`
	Street       string `json:"street_address"`
	City         string `json:"city"`
	Province     string `json:"province"`
	AreaCode     *int   `json:"area_code"`
	Holder       string `json:"bank_account_holder_name"`
	Bank         string `json:"bank_name"`
	Account      string `json:"bank_account_number"`
	Branch       string `json:"bank_branch_code"`
	AccountType  string `json:"bank_account_type"`
	PayoutMethod string `json:"payout_method"`
	Platform     string `json:"ewallet_platform_name"`
	PaymentID    string `json:"ewallet_payment_id"`
}

// Document includes the server-only details needed to render a trade document.
type Document struct {
	Trade      Transaction
	Seller     Contact
	Buyer      Contact
	InvoiceKey string
	// Anonymised is true once the retention job removed the parties' details.
	Anonymised bool
}

// contactFields are the account columns a users row and a collectors row share.
const contactFields = `'name',%[1]s.name,'email',%[1]s.email,'phone',%[1]s.phone,
	'street_address',%[1]s.street_address,'city',%[1]s.city,'province',%[1]s.province,
	'area_code',%[1]s.area_code,'bank_account_holder_name',%[1]s.bank_account_holder_name,
	'bank_name',%[1]s.bank_name,'bank_account_number',%[1]s.bank_account_number,
	'bank_branch_code',%[1]s.bank_branch_code,'bank_account_type',%[1]s.bank_account_type`

// userContact selects only the Contact fields of a users row, not the whole row as JSON.
func userContact(alias string) string {
	return "jsonb_build_object(" + fmt.Sprintf(contactFields, alias) + fmt.Sprintf(`,
	'first_name',%[1]s.first_name,'last_name',%[1]s.last_name,
	'business_name',%[1]s.business_name`, alias) + ")"
}

// collectorContact does the same for a collectors row, which has payout columns instead of names.
func collectorContact(alias string) string {
	return "jsonb_build_object(" + fmt.Sprintf(contactFields, alias) + fmt.Sprintf(`,
	'payout_method',%[1]s.payout_method,'ewallet_platform_name',%[1]s.ewallet_platform_name,
	'ewallet_payment_id',%[1]s.ewallet_payment_id`, alias) + ")"
}

// Document reads snapshot-first collector details, current businesses and exact line values.
func (s *Store) Document(ctx context.Context, id string) (Document, error) {
	var out Document
	trade, err := s.Get(ctx, id)
	if err != nil {
		return out, err
	}

	if trade.Status != "complete" {
		return out, ErrNotFound
	}

	var sellerJSON, buyerJSON []byte
	var anonymised bool
	err = s.db.Q(ctx).QueryRow(ctx, `SELECT COALESCE(t.invoice_key,''),t.anonymised_at IS NOT NULL,
		CASE WHEN t.type='b2b' THEN `+userContact("s")+` ELSE
		COALESCE(`+collectorContact("c")+`,'{}'::jsonb) || COALESCE((SELECT jsonb_object_agg(key,
			-- Convex stored some area codes as 3610.0, which Go cannot read into an int.
			CASE WHEN key='area_code' AND jsonb_typeof(value)='number'
			THEN to_jsonb(trunc((value#>>'{}')::numeric)::int) ELSE value END)
		FROM jsonb_each(COALESCE(t.collector_snapshot,'{}'::jsonb))
		WHERE value <> 'null'::jsonb AND value <> '""'::jsonb),'{}'::jsonb) END,
		`+userContact("b")+` FROM transactions t JOIN users b ON b.id=t.buyer_id
		LEFT JOIN users s ON t.type='b2b' AND s.id=t.seller_id
		LEFT JOIN collectors c ON t.type='c2b' AND c.id=t.seller_id WHERE t.id=$1`, id).Scan(
		&out.InvoiceKey, &anonymised, &sellerJSON, &buyerJSON)
	if err != nil {
		return out, err
	}

	out.Trade = trade

	// After the retention period the parties' details are gone for good.
	if anonymised {
		out.Anonymised = true
		out.Seller, out.Buyer = Contact{Name: "Removed party"}, Contact{Name: "Removed party"}

		return out, nil
	}

	if len(sellerJSON) != 0 {
		if err := json.Unmarshal(sellerJSON, &out.Seller); err != nil {
			return out, err
		}
	}

	if err := json.Unmarshal(buyerJSON, &out.Buyer); err != nil {
		return out, err
	}

	for _, contact := range []*Contact{&out.Seller, &out.Buyer} {
		if err := s.open(contact); err != nil {
			return out, err
		}
	}

	return out, nil
}

// open decrypts the two sealed fields of a contact read from a JSON copy of a
// users or collectors row, or from a snapshot.
func (s *Store) open(contact *Contact) error {
	var err error

	if contact.Account, err = s.cipher.Decrypt(contact.Account); err != nil {
		return err
	}

	contact.PaymentID, err = s.cipher.Decrypt(contact.PaymentID)

	return err
}

// LockInvoice serializes invoice renders and returns the current object key.
func (s *Store) LockInvoice(ctx context.Context, id string) (string, error) {
	var key string
	err := s.db.Q(ctx).QueryRow(ctx,
		`SELECT COALESCE(invoice_key,'') FROM transactions WHERE id=$1 AND status='complete' FOR UPDATE`, id).Scan(&key)

	return key, err
}

// SetInvoice saves a completed render's object reference.
func (s *Store) SetInvoice(ctx context.Context, id, key string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `UPDATE transactions SET invoice_key=$2 WHERE id=$1`, id, key)

	return err
}

// ExportIDs visits authorized transactions without collecting the full export in memory.
func (s *Store) ExportIDs(
	ctx context.Context,
	scope Scope,
	owner, kind string,
	from, to any,
	visit func(string) error,
) error {
	var before *time.Time
	var lastID string
	for {
		rows, err := s.db.Q(ctx).Query(ctx, `SELECT t.id,t.created_at FROM transactions t
			WHERE t.status='complete' AND (`+scopeSQL[scope]+`) AND ($2='' OR t.type=$2)
			AND ($3::timestamptz IS NULL OR `+database.EffectiveDate("t")+` >= $3)
			AND ($4::timestamptz IS NULL OR `+database.EffectiveDate("t")+` <= $4)
			AND ($5::timestamptz IS NULL OR (t.created_at,t.id)<($5,$6))
			ORDER BY t.created_at DESC,t.id DESC LIMIT 100`, owner, kind, from, to, before, lastID)
		if err != nil {
			return err
		}

		var ids []string
		for rows.Next() {
			var id string
			var created time.Time
			if err := rows.Scan(&id, &created); err != nil {
				rows.Close()

				return err
			}

			ids = append(ids, id)
			before, lastID = &created, id
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		// Release the pool connection before document reads, even under many exports.
		for _, id := range ids {
			if err := visit(id); err != nil {
				return err
			}
		}
		if len(ids) < 100 {
			return nil
		}
	}
}
