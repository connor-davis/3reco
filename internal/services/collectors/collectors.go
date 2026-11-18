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
	changes "github.com/connor-davis/3reco/internal/stores/collectorchanges"
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
	db      *database.DB
	store   *store.Store
	audit   *pstore.Store
	waiting *changes.Store
}

// New builds the service.
func New(db *database.DB, rows *store.Store, audit *pstore.Store, waiting *changes.Store) *Service {
	return &Service{db: db, store: rows, audit: audit, waiting: waiting}
}

// Input preserves omitted collector fields on PATCH.
type Input = changes.Fields

// own tells whether the collector record is the caller's own login: the two
// share a normalized phone number.
func (service *Service) own(ctx context.Context, user auth.User, item store.Collector) (bool, error) {
	if !auth.HasRole(user, "collector") || item.NormalizedPhone == "" {
		return false, nil
	}

	phone, err := service.store.OwnPhone(ctx, user.ID)

	return phone != "" && phone == item.NormalizedPhone, err
}

// creator is the business that made the record, or any verified business: an
// admin vouches for those, so they count as the creator of every collector.
func creator(user auth.User, item store.Collector) bool {
	return verifiedBusiness(user) || auth.HasRole(user, "business") &&
		item.CreatedByBusinessID != nil && *item.CreatedByBusinessID == auth.PartyID(user)
}

func verifiedBusiness(user auth.User) bool {
	return auth.HasRole(user, "business") && user.BusinessVerified
}

// canEdit is who may change any collector field, payout fields included:
// staff, admins, and any Owner or Manager of any business. A Member reads
// only. Whether the edit applies at once or waits for staff is decided in
// Save: only the business that created the collector, or staff, applies it.
func canEdit(user auth.User) bool {
	return auth.HasRole(user, "admin", "staff") ||
		(auth.HasRole(user, "business") && auth.BusinessAtLeast(user, "manager"))
}

// full is who may read the whole account number and e-wallet id. Staff may
// manage a collector but only see them masked.
func full(user auth.User, item store.Collector, own bool) bool {
	return auth.HasRole(user, "admin") || (auth.BusinessAtLeast(user, "manager") && creator(user, item)) || own
}

// viewer tells Postgres who is reading, so it can hold back contact details and
// the sealed payout numbers from anyone who may not see them.
func (service *Service) viewer(ctx context.Context, user auth.User) (store.Viewer, error) {
	viewer := store.Viewer{
		ID:           auth.PartyID(user),
		Admin:        auth.HasRole(user, auth.RoleAdmin),
		Staff:        auth.HasRole(user, auth.RoleStaff),
		Business:     auth.BusinessAtLeast(user, "manager"),
		BusinessRole: auth.HasRole(user, "business"),
		Verified:     verifiedBusiness(user),
	}

	if auth.HasRole(user, "collector") {
		var err error

		viewer.OwnPhone, err = service.store.OwnPhone(ctx, user.ID)

		return viewer, err
	}

	return viewer, nil
}

// redact sets the two flags the screen needs. What the caller may see is
// already decided in SQL (see store.columnList), so nothing is blanked here.
func redact(user auth.User, item store.Collector, own bool) store.Collector {
	item.CanEdit = canEdit(user)
	item.CanEditPayout = item.CanEdit
	item.NeedsApproval = item.CanEdit && proposes(user, item)
	item.CanViewPayout = full(user, item, own)

	return item
}

// Find returns a redacted collector unless the caller has management scope.
// Identifiers are masked unless the caller is the creating business, the
// collector themself or an admin; an admin read is written to the audit log.
func (service *Service) Find(ctx context.Context, user auth.User, id string) (store.Collector, error) {
	if user.ID == "" {
		return store.Collector{}, apperr.Unauthorized("Please sign in.")
	}

	viewer, err := service.viewer(ctx, user)
	if err != nil {
		return store.Collector{}, err
	}

	item, err := service.store.FindFor(ctx, id, viewer)
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

	if err != nil {
		return item, err
	}

	// The same flag the list carries, so one row opened alone agrees with it.
	flagged := []store.Collector{redact(user, item, own)}

	return flagged[0], service.markPending(ctx, user, flagged)
}

// disclosed is true when an admin is handed someone else's identifier in full:
// the same decision redact makes, so a masked row never leaves an audit line.
func (service *Service) disclosed(user auth.User, item store.Collector, own bool) bool {
	return auth.HasRole(user, "admin") && !creator(user, item) && !own &&
		full(user, item, own) && (item.BankAccountNumber != "" || item.EwalletPaymentID != "")
}

// List keeps the legacy directory while gating private fields on every row.
func (service *Service) List(ctx context.Context, user auth.User, query paging.Query, after *store.After, selection, desc bool) (any, error) {
	if !auth.HasRole(user, "admin", "staff", "business") {
		return nil, apperr.Forbidden("You cannot manage collectors.")
	}

	phone := phoneDigits(strings.Trim(query.Like, "%"))

	viewer, err := service.viewer(ctx, user)
	if err != nil {
		return nil, err
	}

	items, err := service.store.List(ctx, query, after, phone, desc, viewer)
	if err != nil {
		return nil, err
	}

	// A list never carries a full payout number, for anyone: Postgres sends
	// the mask. The full number is on the one-collector route, which writes
	// the admin audit line.
	for i := range items {
		own, err := service.own(ctx, user, items[i])
		if err != nil {
			return nil, err
		}

		items[i] = redact(user, items[i], own)
	}

	if err := service.markPending(ctx, user, items); err != nil {
		return nil, err
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

// Save changes or creates a collector and returns its id. An edit by a
// business that did not create the collector is not applied: it is kept for
// staff to review, and pending comes back true so the handler can say so.
func (service *Service) Save(ctx context.Context, user auth.User, id string, in Input) (string, bool, error) {
	if !auth.HasRole(user, "admin", "staff", "business") {
		return "", false, apperr.Forbidden("You cannot manage collectors.")
	}

	if auth.HasRole(user, "business") && !auth.BusinessAtLeast(user, "manager") {
		return "", false, apperr.Forbidden("Only managers can change collectors.")
	}

	creating := id == ""
	if creating {
		id = database.NewID()
	}

	pending := false

	err := service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			item := store.Collector{ID: id, CreatedByUserID: user.ID}
			if creating && auth.HasRole(user, "business") {
				businessID := auth.PartyID(user)
				item.CreatedByBusinessID = &businessID
			}

			if !creating {
				var err error
				item, err = service.store.Find(ctx, id, true)
				if err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return err
				}

				if errors.Is(err, pgx.ErrNoRows) {
					return apperr.NotFound("No such collector.")
				}
			}

			merged, err := service.merge(ctx, id, item, in)
			if err != nil {
				return err
			}

			if creating {
				return service.store.Create(ctx, merged)
			}

			// The edit was checked in full above, so staff approve exactly what
			// was checked; it is only kept, not written.
			if proposes(user, item) {
				pending, err = service.propose(ctx, user, item, merged)

				return err
			}

			return service.store.Save(ctx, merged)
		},
	)
	if _, duplicate := database.IsUnique(err); duplicate {
		err = apperr.Conflict(phoneTaken)
	}

	return id, pending, err
}

// merge lays the sent fields over the collector and checks the result: the
// same rules for a new collector, a direct edit, a proposal and an approval.
// It works on a copy, so the caller still holds the collector as it was.
func (service *Service) merge(ctx context.Context, id string, item store.Collector, in Input) (store.Collector, error) {
	replacePayout := in.PayoutMethod != nil &&
		strings.TrimSpace(*in.PayoutMethod) != "" &&
		strings.TrimSpace(*in.PayoutMethod) != item.PayoutMethod

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

	if in.PayoutMethod != nil && strings.TrimSpace(*in.PayoutMethod) != "" {
		method := strings.TrimSpace(*in.PayoutMethod)
		if method != "bank" && method != "ewallet" && method != "none" {
			return item, apperr.Field("payout_method", "Choose bank or ewallet.")
		}

		item.PayoutMethod = method
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

	// Only an explicit choice removes saved payout details.
	if item.PayoutMethod == "none" || (replacePayout && item.PayoutMethod == "ewallet") {
		item.BankAccountHolderName = ""
		item.BankName = ""
		item.BankAccountNumber = ""
		item.BankBranchCode = ""
		item.BankAccountType = ""
	}

	if item.PayoutMethod == "none" || (replacePayout && item.PayoutMethod == "bank") {
		item.EwalletPlatformName = ""
		item.EwalletPaymentID = ""
	}

	if item.PayoutMethod == "none" {
		item.PayoutMethod = ""
	}

	if err := validate(&item); err != nil {
		return item, err
	}

	if item.Phone != "" {
		phone, err := profile.Phone(item.Phone)
		if err != nil {
			return item, err
		}

		item.Phone = phone
		conflict, err := service.store.PhoneConflict(ctx, phone)
		if err != nil {
			return item, err
		}

		if conflict {
			return item, apperr.Conflict("That phone number belongs to a business.")
		}
	}

	// ponytail: a check, not a unique index, because old data may hold
	// duplicates. Two saves at the very same moment could both pass.
	if item.Email != "" {
		conflict, err := service.store.EmailConflict(ctx, item.Email, item.CreatedByBusinessID, id)
		if err != nil {
			return item, err
		}

		if conflict {
			return item, &apperr.Error{
				Status:  http.StatusConflict,
				Code:    "conflict",
				Message: emailTaken,
				Data:    map[string]string{"email": emailTaken},
			}
		}
	}

	return item, nil
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
