package privacy

import (
	"context"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/notifications"
)

// Delete lets a person erase their own account after proving it is them with
// their password. The route has no id: it only acts on the caller.
func (s *Service) Delete(ctx context.Context, user auth.User, password string) error {
	if err := s.auth.ConfirmPassword(ctx, user.ID, password); err != nil {
		return err
	}

	return s.Erase(ctx, user.ID, user.ID)
}

// Erase anonymises a user. Both the self-service route and the admin removal
// call it, so they do exactly the same. Open requests are cancelled and the
// other side told; finished trades stay under the name "Removed account" and
// their invoices are rebuilt. The avatar file is removed and the sockets are
// closed only after the transaction commits.
func (s *Service) Erase(ctx context.Context, actorID, id string) error {
	return s.db.InTx(ctx, func(ctx context.Context) error {
		found, err := s.store.LockActive(ctx, id)
		if err != nil {
			return err
		}

		if !found {
			return apperr.NotFound("User not found.")
		}

		trades, err := s.store.Trades(ctx, id)
		if err != nil {
			return err
		}

		cancelled, err := s.store.CancelOpenRequests(ctx, id)
		if err != nil {
			return err
		}

		// The other side lands on the page where their open requests are listed.
		for _, request := range cancelled {
			if err := s.notes.RequestEnded(ctx, request.RequestID); err != nil {
				return err
			}

			link := "/market/outgoing"
			if request.ErasedWasBuyer {
				link = "/market/incoming"
			}

			err := s.notes.Notify(ctx, request.OtherID, notifications.RequestCancelled,
				"Request cancelled", "A request was cancelled because the other account was removed.", link)
			if err != nil {
				return err
			}
		}

		avatar, err := s.store.Erase(ctx, id, actorID)
		if err != nil {
			return err
		}

		if avatar != "" {
			s.objects.RemoveAfterCommit(ctx, avatar)
		}

		database.AfterCommit(ctx, func() { s.hub.DisconnectUser(id) })

		// The other side of each trade is not told: nothing new happened to them.
		for _, tid := range trades {
			s.trades.QueueInvoice(ctx, tid, false)
		}

		return s.store.Record(ctx, actorID, id, KindDelete)
	})
}
