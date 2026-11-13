package transactions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/connor-davis/3reco/internal/platform/crypt"
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

// Payout says how much of the seller's payout details a Document carries. It
// is decided before the query and applied inside it, so a reader who may not
// see a number never receives it, sealed or whole.
type Payout int

// The three ways to read a payout: the mask ("•••• 1234"), whole, or not at all.
const (
	PayoutMasked Payout = iota
	PayoutFull
	PayoutHidden
)

// PayoutFor picks the payout view once the trade is known.
type PayoutFor func(Transaction) (Payout, error)

// contactFields are the identity columns a users row and a collectors row share.
const contactFields = `'name',%[1]s.name,'email',%[1]s.email,'phone',%[1]s.phone,
	'street_address',%[1]s.street_address,'city',%[1]s.city,'province',%[1]s.province,
	'area_code',%[1]s.area_code`

// userContact selects only the identity fields of a users row, not the whole row as JSON.
func userContact(alias string) string {
	return "jsonb_build_object(" + fmt.Sprintf(contactFields, alias) + fmt.Sprintf(`,
	'first_name',%[1]s.first_name,'last_name',%[1]s.last_name,
	'business_name',%[1]s.business_name`, alias) + ")"
}

// collectorContact does the same for a collectors row.
func collectorContact(alias string) string {
	return "jsonb_build_object(" + fmt.Sprintf(contactFields, alias) + ")"
}

// payoutKeys are the payout fields of a Contact. They are built only by
// payoutObject, so a snapshot's copy of them is dropped first.
const payoutKeys = `ARRAY['bank_account_holder_name','bank_name','bank_account_number','bank_branch_code',
	'bank_account_type','payout_method','ewallet_platform_name','ewallet_payment_id']`

// payoutObject builds the seller's payout fields from the given column
// expressions. $2 is "show whole" and $3 is "hide all"; with neither, the two
// numbers come back as their mask and the branch code masked.
func payoutObject(holder, bank, account, accountLast4, branch, kind, method, platform, wallet, walletLast4 string) string {
	whole := func(value string) string {
		return `CASE WHEN $3 THEN '' ELSE COALESCE(` + value + `,'') END`
	}

	return `jsonb_build_object(
		'bank_account_holder_name',` + whole(holder) + `,'bank_name',` + whole(bank) + `,
		'bank_account_type',` + whole(kind) + `,'payout_method',` + whole(method) + `,
		'ewallet_platform_name',` + whole(platform) + `,
		'bank_account_number',CASE WHEN $3 THEN '' WHEN $2 THEN COALESCE(` + account + `,'')
			ELSE mask_sealed(` + account + `,` + accountLast4 + `) END,
		'bank_branch_code',CASE WHEN $3 THEN '' WHEN $2 THEN COALESCE(` + branch + `,'')
			ELSE mask_last4(COALESCE(` + branch + `,'')) END,
		'ewallet_payment_id',CASE WHEN $3 THEN '' WHEN $2 THEN COALESCE(` + wallet + `,'')
			ELSE mask_sealed(` + wallet + `,` + walletLast4 + `) END)`
}

// snapshotValue is one field of the frozen collector copy on a trade, or the
// current collector's when the copy has none (blank snapshot values never
// override, the same rule the merge below uses).
func snapshotValue(key string) string {
	return `COALESCE(NULLIF(t.collector_snapshot->>'` + key + `',''),c.` + key + `)`
}

// Document reads snapshot-first collector details, current businesses and exact
// line values. payoutFor chooses, once the trade is read, how much of the
// seller's payout comes back.
func (s *Store) Document(ctx context.Context, id string, payoutFor PayoutFor) (Document, error) {
	var out Document
	trade, err := s.Get(ctx, id)
	if err != nil {
		return out, err
	}

	if trade.Status != "complete" {
		return out, ErrNotFound
	}

	payout, err := payoutFor(trade)
	if err != nil {
		return out, err
	}

	var sellerJSON, buyerJSON []byte
	var anonymised bool
	err = s.db.Q(ctx).QueryRow(ctx, `SELECT COALESCE(t.invoice_key,''),t.anonymised_at IS NOT NULL,
		CASE WHEN t.type='b2b' THEN `+userContact("s")+` || `+payoutObject(
		"s.bank_account_holder_name", "s.bank_name", "s.bank_account_number",
		"COALESCE(sb.bank_account_last4,su.bank_account_last4)", "s.bank_branch_code",
		"s.bank_account_type", "NULL", "NULL", "NULL", "NULL")+` ELSE
		COALESCE(`+collectorContact("c")+`,'{}'::jsonb) || COALESCE((SELECT jsonb_object_agg(key,
			-- Convex stored some area codes as 3610.0, which Go cannot read into an int.
			CASE WHEN key='area_code' AND jsonb_typeof(value)='number'
			THEN to_jsonb(trunc((value#>>'{}')::numeric)::int) ELSE value END)
		FROM jsonb_each(COALESCE(t.collector_snapshot,'{}'::jsonb)-`+payoutKeys+`)
		WHERE value <> 'null'::jsonb AND value <> '""'::jsonb),'{}'::jsonb) || `+payoutObject(
		snapshotValue("bank_account_holder_name"), snapshotValue("bank_name"),
		snapshotValue("bank_account_number"), snapshotValue("bank_account_last4"),
		snapshotValue("bank_branch_code"), snapshotValue("bank_account_type"),
		snapshotValue("payout_method"), snapshotValue("ewallet_platform_name"),
		snapshotValue("ewallet_payment_id"), snapshotValue("ewallet_payment_id_last4"))+` END,
		`+userContact("b")+` FROM transactions t JOIN business_profiles b ON b.id=t.buyer_id
		LEFT JOIN business_profiles s ON t.type='b2b' AND s.id=t.seller_id
		LEFT JOIN businesses sb ON t.type='b2b' AND sb.id=t.seller_id
		LEFT JOIN users su ON t.type='b2b' AND su.id=t.seller_id
		LEFT JOIN collectors c ON t.type='c2b' AND c.id=t.seller_id WHERE t.id=$1`,
		id, payout == PayoutFull, payout == PayoutHidden).Scan(
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

	// Only a whole payout is sealed; the buyer has none.
	if err := s.open(&out.Seller); err != nil {
		return out, err
	}

	return out, nil
}

// open decrypts the two sealed fields of a contact. A masked or empty value
// was never sealed, so it stays as Postgres sent it.
func (s *Store) open(contact *Contact) error {
	for _, field := range []*string{&contact.Account, &contact.PaymentID} {
		plain, err := s.cipher.Decrypt(*field)
		if errors.Is(err, crypt.ErrNotEncrypted) {
			continue
		}

		if err != nil {
			return err
		}

		*field = plain
	}

	return nil
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
	owner, kind, like string,
	from, to any,
	visit func(string) error,
) error {
	var before *time.Time
	var recorded *time.Time
	var lastID string
	for {
		rows, err := s.db.Q(ctx).Query(ctx, `SELECT t.id,`+database.EffectiveDate("t")+`,t.created_at`+fromJoins+`
			WHERE t.status='complete' AND (`+scopeSQL[scope]+`) AND ($2='' OR t.type=$2)
			AND ($3::timestamptz IS NULL OR `+database.EffectiveDate("t")+` >= $3)
			AND ($4::timestamptz IS NULL OR `+database.EffectiveDate("t")+` <= $4)
			AND ($8='' OR t.id ILIKE $8 OR `+database.DisplayName("b")+` ILIKE $8
			OR COALESCE(c.name, `+database.DisplayName("s")+`) ILIKE $8
			OR EXISTS(SELECT 1 FROM transaction_items i JOIN materials m ON m.id=i.material_id
				WHERE i.transaction_id=t.id AND m.name ILIKE $8))
			AND ($5::timestamptz IS NULL OR (`+database.EffectiveDate("t")+`,t.created_at,t.id)<($5,$7::timestamptz,$6))
			ORDER BY `+database.EffectiveDate("t")+` DESC,t.created_at DESC,t.id DESC LIMIT 100`,
			owner, kind, from, to, before, lastID, recorded, like)
		if err != nil {
			return err
		}

		var ids []string
		for rows.Next() {
			var id string
			var effective, created time.Time
			if err := rows.Scan(&id, &effective, &created); err != nil {
				rows.Close()

				return err
			}

			ids = append(ids, id)
			before, recorded, lastID = &effective, &created, id
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
