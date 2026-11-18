package collectors

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	changes "github.com/connor-davis/3reco/internal/stores/collectorchanges"
	store "github.com/connor-davis/3reco/internal/stores/collectors"
)

// proposes is true when an edit must wait for staff: a business edits a
// collector that a different business (or staff) created. The creating
// business, admins and staff apply their edits at once.
func proposes(user auth.User, item store.Collector) bool {
	return auth.HasRole(user, "business") && !auth.HasRole(user, "admin", "staff") &&
		(item.CreatedByBusinessID == nil || *item.CreatedByBusinessID != auth.PartyID(user))
}

// FieldsOf reads every field of a collector as a full set.
func FieldsOf(item store.Collector) changes.Fields {
	return changes.Fields{
		Name:                  &item.Name,
		Email:                 &item.Email,
		Phone:                 &item.Phone,
		Image:                 &item.Image,
		BankAccountHolderName: &item.BankAccountHolderName,
		BankName:              &item.BankName,
		BankAccountNumber:     &item.BankAccountNumber,
		BankBranchCode:        &item.BankBranchCode,
		BankAccountType:       &item.BankAccountType,
		PayoutMethod:          &item.PayoutMethod,
		EwalletPlatformName:   &item.EwalletPlatformName,
		EwalletPaymentID:      &item.EwalletPaymentID,
		StreetAddress:         &item.StreetAddress,
		City:                  &item.City,
		Province:              &item.Province,
		AreaCode:              item.AreaCode,
	}
}

// propose keeps the fields that differ between the collector and the checked
// result as this business's one waiting change. It says whether anything was
// kept: an edit that changes nothing has nothing to approve.
func (service *Service) propose(ctx context.Context, user auth.User, before, after store.Collector) (bool, error) {
	was, now := FieldsOf(before), FieldsOf(after)

	var proposed changes.Fields

	changed := false
	wasText, nowText, proposedText := was.Text(), now.Text(), proposed.Text()

	for i := range proposedText {
		if **wasText[i] != **nowText[i] {
			*proposedText[i] = *nowText[i]
			changed = true
		}
	}

	// The area code can be set but not cleared, as in a direct edit.
	if now.AreaCode != nil && (was.AreaCode == nil || *was.AreaCode != *now.AreaCode) {
		proposed.AreaCode = now.AreaCode
		changed = true
	}

	if !changed {
		return false, nil
	}

	err := service.waiting.Replace(ctx, changes.Change{
		ID:           database.NewID(),
		CollectorID:  before.ID,
		BusinessID:   auth.PartyID(user),
		ActingUserID: &user.ID,
		Fields:       proposed,
	})

	return err == nil, err
}

// Apply saves an approved change as the reviewer, through Save's own checks, so
// it meets the same rules as any edit made today. Only staff may call it.
func (service *Service) Apply(ctx context.Context, reviewer auth.User, id string, fields Input) error {
	if !auth.HasRole(reviewer, "admin", "staff") {
		return apperr.Forbidden("Only staff can approve a change.")
	}

	// Save clears the payout when told "none"; an empty method means the same
	// in a saved change.
	if fields.PayoutMethod != nil && *fields.PayoutMethod == "" {
		none := "none"
		fields.PayoutMethod = &none
	}

	_, _, err := service.Save(ctx, reviewer, id, fields)

	return err
}

// markPending flags the collectors that have a change from the caller's
// business still waiting for staff. Other businesses' changes stay unseen.
func (service *Service) markPending(ctx context.Context, user auth.User, items []store.Collector) error {
	if !auth.HasRole(user, "business") || len(items) == 0 {
		return nil
	}

	ids := make([]string, len(items))
	for i, item := range items {
		ids[i] = item.ID
	}

	waiting, err := service.waiting.PendingFor(ctx, auth.PartyID(user), ids)
	if err != nil {
		return err
	}

	for i := range items {
		items[i].PendingChange = waiting[items[i].ID]
	}

	return nil
}
