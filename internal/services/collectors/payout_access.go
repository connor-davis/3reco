package collectors

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/services/auth"
)

// CanReadFullPayout applies the collector service's existing ownership and
// login checks to document reads, including frozen payout snapshots.
func (service *Service) CanReadFullPayout(ctx context.Context, user auth.User, id string) (bool, error) {
	item, err := service.store.Find(ctx, id, false)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	own, err := service.own(ctx, user, item)
	if err != nil {
		return false, err
	}

	return full(user, item, own), nil
}
