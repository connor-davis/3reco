package collectors

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
	profile "github.com/connor-davis/3reco/internal/services/profile"
	store "github.com/connor-davis/3reco/internal/stores/collectors"
)

// Stats prevents phone enumeration outside staff or the creator business's scope.
func (service *Service) Stats(ctx context.Context, user auth.User, phone string) (*store.Stats, error) {
	if !auth.HasRole(user, "admin", "staff", "business") {
		return nil, apperr.Forbidden("You cannot look up collector statistics.")
	}

	phone, err := profile.Phone(phone)
	if err != nil {
		return nil, err
	}

	creator := ""
	if auth.HasRole(user, "business") && !user.BusinessVerified {
		creator = auth.PartyID(user)
	}

	item, err := service.store.ByPhone(ctx, phone, creator)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	result, err := service.store.Stats(ctx, item)
	result.Collector = redact(user, result.Collector, false)

	return &result, err
}
