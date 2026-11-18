// Package collectorchanges lets staff review the edits a business proposed to a
// collector another business created: approve to apply, reject to drop.
package collectorchanges

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/collectors"
	"github.com/connor-davis/3reco/internal/services/notifications"
	changes "github.com/connor-davis/3reco/internal/stores/collectorchanges"
	rows "github.com/connor-davis/3reco/internal/stores/collectors"
)

// Service owns the review rules.
type Service struct {
	db         *database.DB
	waiting    *changes.Store
	records    *rows.Store
	collectors *collectors.Service
	notes      *notifications.Service
}

// New builds the service.
func New(
	db *database.DB,
	waiting *changes.Store,
	records *rows.Store,
	service *collectors.Service,
	notes *notifications.Service,
) *Service {
	return &Service{db: db, waiting: waiting, records: records, collectors: service, notes: notes}
}

// Field is one line of a change: what it was and what it would become. Secret
// values arrive masked to their last four characters.
type Field struct {
	Field  string `json:"field"`
	Label  string `json:"label"`
	Old    string `json:"old"`
	New    string `json:"new"`
	Secret bool   `json:"secret"`
}

// Item is one waiting change as staff see it.
type Item struct {
	ID            string    `json:"id"`
	CollectorID   string    `json:"collector_id"`
	CollectorName string    `json:"collector_name"`
	BusinessID    string    `json:"business_id"`
	BusinessName  string    `json:"business_name"`
	CreatedAt     time.Time `json:"created_at"`
	Changes       []Field   `json:"changes"`
}

// labels are the words staff read, in the order of changes.TextColumns.
var labels = []string{
	"Name", "Email", "Phone", "Photo", "Account holder", "Bank", "Account number",
	"Branch code", "Account type", "Payout method", "E-wallet", "E-wallet ID",
	"Street address", "City", "Province",
}

// hidden fields are shown masked: the payout numbers and the branch code keep
// their last four characters, a photo is only said to exist.
var hidden = map[string]bool{
	"image": true, "bank_account_number": true, "bank_branch_code": true, "ewallet_payment_id": true,
}

var methods = map[string]string{"bank": "Bank account", "ewallet": "E-wallet", "": "None"}

func requireStaff(user auth.User) error {
	if !auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff) {
		return apperr.Forbidden("Only staff can review collector changes.")
	}

	return nil
}

// show is the text staff read for one value.
func show(column, value string) string {
	switch {
	case column == "payout_method":
		return methods[value]
	case column == "image":
		if value == "" {
			return ""
		}

		return "A photo"
	case hidden[column]:
		return crypt.Mask(value)
	}

	return value
}

// Queue lists the waiting changes, oldest first, for staff only.
func (service *Service) Queue(ctx context.Context, user auth.User) ([]Item, error) {
	if err := requireStaff(user); err != nil {
		return nil, err
	}

	waiting, err := service.waiting.Pending(ctx)
	if err != nil {
		return nil, err
	}

	ids := make([]string, len(waiting))
	for i, change := range waiting {
		ids[i] = change.BusinessID
	}

	names, err := service.waiting.BusinessNames(ctx, ids)
	if err != nil {
		return nil, err
	}

	items := []Item{}

	// ponytail: one collector read per waiting change. The queue holds at most
	// 200, so it is bounded; join them in SQL if staff ever work a bigger one.
	for _, change := range waiting {
		item, err := service.records.Find(ctx, change.CollectorID, false)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}

		if err != nil {
			return nil, err
		}

		items = append(items, Item{
			ID:            change.ID,
			CollectorID:   change.CollectorID,
			CollectorName: item.Name,
			BusinessID:    change.BusinessID,
			BusinessName:  names[change.BusinessID],
			CreatedAt:     change.CreatedAt,
			Changes:       describe(item, change),
		})
	}

	return items, nil
}

// describe lists what a change would alter, old against new.
func describe(item rows.Collector, change changes.Change) []Field {
	was := collectors.FieldsOf(item)
	wasText, nowText := was.Text(), change.Text()
	out := []Field{}

	for i, column := range changes.TextColumns {
		if *nowText[i] == nil {
			continue
		}

		out = append(out, Field{
			Field:  column,
			Label:  labels[i],
			Old:    show(column, **wasText[i]),
			New:    show(column, **nowText[i]),
			Secret: hidden[column],
		})
	}

	if change.AreaCode != nil {
		old := ""
		if was.AreaCode != nil {
			old = strconv.Itoa(*was.AreaCode)
		}

		out = append(out, Field{Field: "area_code", Label: "Area code", Old: old, New: strconv.Itoa(*change.AreaCode)})
	}

	return out
}

// Approve applies a waiting change through the normal collector checks and
// tells the business. If the collector no longer passes them (say another
// collector took the email since), nothing changes and staff see why.
func (service *Service) Approve(ctx context.Context, user auth.User, id string) error {
	return service.resolve(ctx, user, id, "approved", "")
}

// Reject closes a waiting change without touching the collector. The reason,
// if any, goes to the business.
func (service *Service) Reject(ctx context.Context, user auth.User, id, reason string) error {
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) > 500 {
		return apperr.Field("reason", "Use at most 500 characters.")
	}

	return service.resolve(ctx, user, id, "rejected", reason)
}

// resolve closes a change once. The lock makes a second reviewer wait, then
// find it already closed. The change, the collector and the notices commit
// together.
func (service *Service) resolve(ctx context.Context, user auth.User, id, status, reason string) error {
	if err := requireStaff(user); err != nil {
		return err
	}

	return service.db.InTx(ctx, func(ctx context.Context) error {
		change, err := service.waiting.Lock(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("Change not found.")
		}

		if err != nil {
			return err
		}

		if change.Status != "pending" {
			return apperr.Conflict("This change was already reviewed.")
		}

		item, err := service.records.Find(ctx, change.CollectorID, false)
		if err != nil {
			return err
		}

		if status == "approved" {
			if err := service.collectors.Apply(ctx, user, change.CollectorID, change.Fields); err != nil {
				return err
			}
		}

		if err := service.waiting.Resolve(ctx, id, status, user.ID, reason); err != nil {
			return err
		}

		return service.tell(ctx, change.BusinessID, item.Name, status, reason)
	})
}

// tell sends the outcome to the business's Owners and Managers.
func (service *Service) tell(ctx context.Context, business, collector, status, reason string) error {
	people, err := service.waiting.Reviewers(ctx, business)
	if err != nil {
		return err
	}

	title, body := "Collector change approved", "Your change to "+collector+" was approved."
	if status == "rejected" {
		title, body = "Collector change not approved", "Your change to "+collector+" was not approved."

		if reason != "" {
			body += " Reason: " + reason
		}
	}

	for _, person := range people {
		if err := service.notes.Notify(
			ctx,
			person,
			notifications.CollectorChange,
			title,
			body,
			"/collectors",
		); err != nil {
			return err
		}
	}

	return nil
}
