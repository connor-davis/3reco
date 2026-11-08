// Package collectors applies management scope and payout redaction.
package collectors

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/privacy"
	profile "github.com/connor-davis/3reco/internal/services/profile"
	store "github.com/connor-davis/3reco/internal/stores/collectors"
	pstore "github.com/connor-davis/3reco/internal/stores/privacy"
)

// The two duplicate messages read the same way, one per field.
const (
	emailTaken = "A collector with that email address already exists."
	phoneTaken = "A collector with that phone number already exists."
)

// Service owns collector rules and transactions.
type Service struct {
	db    *database.DB
	store *store.Store
	audit *pstore.Store
}

// New builds the service.
func New(db *database.DB, rows *store.Store, audit *pstore.Store) *Service {
	return &Service{db: db, store: rows, audit: audit}
}

// Input preserves omitted collector fields on PATCH.
type Input struct {
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

// own tells whether the collector record is the caller's own login: the two
// share a normalized phone number.
func (service *Service) own(ctx context.Context, user auth.User, item store.Collector) (bool, error) {
	if !auth.HasRole(user, "collector") || item.NormalizedPhone == "" {
		return false, nil
	}

	phone, err := service.store.OwnPhone(ctx, user.ID)

	return phone != "" && phone == item.NormalizedPhone, err
}

func creator(user auth.User, item store.Collector) bool {
	return auth.HasRole(user, "business") && item.CreatedByBusinessID != nil &&
		*item.CreatedByBusinessID == user.ID
}

// manages is who may see the contact details and change the record.
func manages(user auth.User, item store.Collector, own bool) bool {
	return auth.HasRole(user, "admin", "staff") || creator(user, item) || own
}

// full is who may read the whole account number and e-wallet id. Staff may
// manage a collector but only see them masked.
func full(user auth.User, item store.Collector, own bool) bool {
	return auth.HasRole(user, "admin") || creator(user, item) || own
}

func redact(user auth.User, item store.Collector, own bool) store.Collector {
	item.CanEdit = manages(user, item, false)
	item.CanViewPayout = full(user, item, own)

	if !item.CanViewPayout {
		item.BankAccountNumber = crypt.Mask(item.BankAccountNumber)
		item.BankBranchCode = crypt.Mask(item.BankBranchCode)
		item.EwalletPaymentID = crypt.Mask(item.EwalletPaymentID)
	}

	if manages(user, item, own) {
		return item
	}

	item.Email = ""
	item.Phone = ""

	item.BankAccountHolderName = ""
	item.BankName = ""
	item.BankBranchCode = ""
	item.BankAccountType = ""

	item.PayoutMethod = ""
	item.EwalletPlatformName = ""

	item.StreetAddress = ""
	item.AreaCode = nil

	return item
}

// Find returns a redacted collector unless the caller has management scope.
// Identifiers are masked unless the caller is the creating business, the
// collector themself or an admin; an admin read is written to the audit log.
func (service *Service) Find(ctx context.Context, user auth.User, id string) (store.Collector, error) {
	if user.ID == "" {
		return store.Collector{}, apperr.Unauthorized("Please sign in.")
	}

	item, err := service.store.Find(ctx, id, false)
	if errors.Is(err, pgx.ErrNoRows) {
		return item, apperr.NotFound("No such collector.")
	}

	if err != nil {
		return item, err
	}

	own, err := service.own(ctx, user, item)
	if err != nil {
		return item, err
	}

	if service.disclosed(user, item, own) {
		err = service.audit.Record(ctx, user.ID, item.ID, privacy.KindAdminFullView)
	}

	return redact(user, item, own), err
}

// disclosed is true when an admin is handed someone else's identifier in full:
// the same decision redact makes, so a masked row never leaves an audit line.
func (service *Service) disclosed(user auth.User, item store.Collector, own bool) bool {
	return auth.HasRole(user, "admin") && !creator(user, item) && !own &&
		full(user, item, own) && (item.BankAccountNumber != "" || item.EwalletPaymentID != "")
}

// List keeps the legacy directory while gating private fields on every row.
func (service *Service) List(ctx context.Context, user auth.User, query paging.Query, after *store.After, selection bool) (any, error) {
	if !auth.HasRole(user, "admin", "staff", "business") {
		return nil, apperr.Forbidden("You cannot manage collectors.")
	}

	phone := phoneDigits(strings.Trim(query.Like, "%"))

	items, err := service.store.List(ctx, query, after, phone)
	if err != nil {
		return nil, err
	}

	// Each row an admin sees with a full identifier is one audit line naming
	// that collector; rows cut off by the page limit are never shown.
	shown := min(len(items), query.Limit)
	if selection {
		shown = min(len(items), 200)
	}

	for i := range items {
		own, err := service.own(ctx, user, items[i])
		if err != nil {
			return nil, err
		}

		if i < shown && service.disclosed(user, items[i], own) {
			err := service.audit.Record(ctx, user.ID, items[i].ID, privacy.KindAdminFullView)
			if err != nil {
				return nil, err
			}
		}

		items[i] = redact(user, items[i], own)
	}

	if selection {
		if len(items) > 200 {
			items = items[:200]
		}

		return items, nil
	}

	page := paging.Page[store.Collector]{Items: items}
	if len(items) > query.Limit {
		page.Items = items[:query.Limit]
		page.HasMore = true

		last := page.Items[query.Limit-1]
		next := base64.RawURLEncoding.EncodeToString([]byte(last.ID + "|" + last.Name))
		page.NextCursor = &next
	}

	total, err := service.store.Count(ctx, query, phone)
	if err != nil {
		return nil, err
	}

	return struct {
		paging.Page[store.Collector]
		Total int `json:"total"`
	}{Page: page, Total: total}, nil
}

// phoneDigits turns a phone-shaped search into the digits stored for a
// collector, so "082 777", "+27 82 777" and "0827771" all find +27827771234.
// Anything else, or fewer than three digits, is not treated as a phone.
func phoneDigits(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.Trim(raw, "+0123456789 ()-") != "" {
		return ""
	}

	var digits strings.Builder
	for _, char := range raw {
		if char >= '0' && char <= '9' {
			digits.WriteRune(char)
		}
	}

	number := digits.String()
	if len(number) < 3 {
		return ""
	}

	if number[0] == '0' && !strings.HasPrefix(raw, "+") {
		return "27" + number[1:]
	}

	return number
}

// ParseCursor reads a cursor List handed out earlier. Empty means the start.
// The id comes first because it has no "|", so a name may hold one.
func ParseCursor(raw string) (*store.After, error) {
	if raw == "" {
		return nil, nil
	}

	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	id, name, found := strings.Cut(string(decoded), "|")
	if err != nil || !found || id == "" {
		return nil, apperr.BadRequest("The page cursor is not valid.", nil)
	}

	return &store.After{Name: name, ID: id}, nil
}

// Save scopes changes to the creator business or staff and validates the merged record.
func (service *Service) Save(ctx context.Context, user auth.User, id string, in Input) (string, error) {
	if !auth.HasRole(user, "admin", "staff", "business") {
		return "", apperr.Forbidden("You cannot manage collectors.")
	}

	creating := id == ""
	if creating {
		id = database.NewID()
	}

	err := service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			item := store.Collector{ID: id, CreatedByUserID: user.ID}
			if creating && auth.HasRole(user, "business") {
				item.CreatedByBusinessID = &user.ID
			}

			if !creating {
				var err error
				item, err = service.store.Find(ctx, id, true)
				if err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return err
				}

				// Only staff, admins and the creating business may change a
				// collector, never the collector's own login.
				if errors.Is(err, pgx.ErrNoRows) || !manages(user, item, false) {
					return apperr.NotFound("No such collector.")
				}

				// Staff can update contact details without replacing private payout identifiers.
				if !full(user, item, false) {
					for _, field := range []struct {
						sent    *string
						current string
					}{
						{in.BankAccountNumber, item.BankAccountNumber},
						{in.BankBranchCode, item.BankBranchCode},
						{in.EwalletPaymentID, item.EwalletPaymentID},
					} {
						if field.sent != nil && !isMask(*field.sent, field.current) {
							return apperr.Forbidden("You cannot change private payout identifiers.")
						}
					}
				}
			}

			if in.Name != nil {
				item.Name = strings.TrimSpace(*in.Name)
			}

			if in.Email != nil {
				item.Email = strings.TrimSpace(*in.Email)
			}

			if in.Phone != nil {
				item.Phone = strings.TrimSpace(*in.Phone)
			}

			if in.Image != nil {
				item.Image = strings.TrimSpace(*in.Image)
			}

			if in.BankAccountHolderName != nil {
				item.BankAccountHolderName = strings.TrimSpace(*in.BankAccountHolderName)
			}

			if in.BankName != nil {
				item.BankName = strings.TrimSpace(*in.BankName)
			}

			// A masked value sent back from a form means "unchanged".
			if in.BankAccountNumber != nil && !isMask(*in.BankAccountNumber, item.BankAccountNumber) {
				item.BankAccountNumber = strings.TrimSpace(*in.BankAccountNumber)
			}

			if in.BankBranchCode != nil && !isMask(*in.BankBranchCode, item.BankBranchCode) {
				item.BankBranchCode = strings.TrimSpace(*in.BankBranchCode)
			}

			if in.BankAccountType != nil {
				item.BankAccountType = strings.TrimSpace(*in.BankAccountType)
			}

			if in.PayoutMethod != nil {
				item.PayoutMethod = strings.TrimSpace(*in.PayoutMethod)
			}

			if in.EwalletPlatformName != nil {
				item.EwalletPlatformName = strings.TrimSpace(*in.EwalletPlatformName)
			}

			if in.EwalletPaymentID != nil && !isMask(*in.EwalletPaymentID, item.EwalletPaymentID) {
				item.EwalletPaymentID = strings.TrimSpace(*in.EwalletPaymentID)
			}

			if in.StreetAddress != nil {
				item.StreetAddress = strings.TrimSpace(*in.StreetAddress)
			}

			if in.City != nil {
				item.City = strings.TrimSpace(*in.City)
			}

			if in.Province != nil {
				item.Province = strings.TrimSpace(*in.Province)
			}

			if in.AreaCode != nil {
				item.AreaCode = in.AreaCode
			}

			if err := validate(&item); err != nil {
				return err
			}

			if item.Phone != "" {
				phone, err := profile.Phone(item.Phone)
				if err != nil {
					return err
				}

				item.Phone = phone
				conflict, err := service.store.PhoneConflict(ctx, phone)
				if err != nil {
					return err
				}

				if conflict {
					return apperr.Conflict("That phone number belongs to a business.")
				}
			}

			// ponytail: a check, not a unique index, because old data may hold
			// duplicates. Two saves at the very same moment could both pass.
			if item.Email != "" {
				conflict, err := service.store.EmailConflict(ctx, item.Email, item.CreatedByBusinessID, id)
				if err != nil {
					return err
				}

				if conflict {
					return &apperr.Error{
						Status:  http.StatusConflict,
						Code:    "conflict",
						Message: emailTaken,
						Data:    map[string]string{"email": emailTaken},
					}
				}
			}

			if creating {
				return service.store.Create(ctx, item)
			}

			return service.store.Save(ctx, item)
		},
	)
	if _, duplicate := database.IsUnique(err); duplicate {
		err = apperr.Conflict(phoneTaken)
	}

	return id, err
}

// Delete requires a confirmation value and staff authority.
func (service *Service) Delete(ctx context.Context, user auth.User, id, confirmation string) error {
	if !auth.HasRole(user, "admin", "staff") {
		return apperr.Forbidden("Only staff may remove collectors.")
	}

	return service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			item, err := service.store.Find(ctx, id, true)
			if errors.Is(err, pgx.ErrNoRows) {
				return apperr.NotFound("No such collector.")
			}

			if err != nil {
				return err
			}

			expected := item.Email
			confirmation = strings.TrimSpace(confirmation)
			if expected != "" {
				if !strings.EqualFold(expected, confirmation) {
					return apperr.Field("confirmation_value", "Enter the collector email.")
				}
			} else {
				normalized, err := profile.Phone(confirmation)
				if err != nil || normalized != item.Phone {
					return apperr.Field("confirmation_value", "Enter the collector phone.")
				}
			}

			return service.store.Delete(ctx, id)
		},
	)
}

func isMask(sent, current string) bool {
	return current != "" && strings.TrimSpace(sent) == crypt.Mask(current)
}
