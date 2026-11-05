package requests

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/notifications"
	"github.com/connor-davis/3reco/internal/services/transactions"
	store "github.com/connor-davis/3reco/internal/stores/requests"
)

// MakeOffer lets the seller put weights and prices on an open request. The
// offer must name at least one material of the request; a bad offer changes
// nothing.
func (s *Service) MakeOffer(
	ctx context.Context,
	user auth.User,
	id string,
	offer []transactions.SaleItem,
) error {
	return s.db.InTx(ctx, func(ctx context.Context) error {
		r, err := s.load(ctx, user, id, true)
		if err != nil {
			return err
		}

		if r.Seller.ID != user.ID {
			return apperr.Forbidden("Only the seller can make an offer.")
		}

		if r.Status != StatusPending && r.Status != StatusOffered {
			return apperr.Conflict("An offer can only be made on an open request.")
		}

		if err := transactions.CheckItems(offer); err != nil {
			return err
		}

		// Share settlement's material order; each material's stock is ordered by ID.
		offer = slices.Clone(offer)
		slices.SortFunc(offer, func(a, b transactions.SaleItem) int {
			return strings.Compare(a.MaterialID, b.MaterialID)
		})

		if err := s.store.ReleaseHolds(ctx, id); err != nil {
			return err
		}

		if err := s.checkOffer(ctx, r, offer); err != nil {
			return err
		}

		if err := s.store.ClearOffers(ctx, id); err != nil {
			return err
		}

		for _, line := range offer {
			if err := s.store.SetOffer(ctx, id, line.MaterialID, line.Weight, line.Price); err != nil {
				return err
			}
		}

		if err := s.store.SetStatus(ctx, id, StatusOffered); err != nil {
			return err
		}

		name := firstName(r.Items)
		if len(offer) > 1 {
			name = fmt.Sprintf("%d materials", len(offer))
		}

		body := fmt.Sprintf("The seller has made an offer on your %s. "+
			"Review and accept to complete the trade.", name)

		return s.notes.Notify(ctx, r.Buyer.ID, notifications.RequestAccepted,
			"Offer received!", body, "/market/"+id)
	})
}

// checkOffer makes sure every offered line is a material of the request and
// that the seller can honour it.
func (s *Service) checkOffer(ctx context.Context, r store.Request, offer []transactions.SaleItem) error {
	asked := map[string]bool{}
	for _, item := range r.Items {
		asked[item.MaterialID] = true
	}

	for _, line := range offer {
		if !asked[line.MaterialID] {
			return apperr.Field("items", "That material is not part of this request.")
		}

		if err := s.trades.CheckOffer(ctx, line); err != nil {
			return err
		}

		held, err := s.store.ReserveHold(ctx, r, line.MaterialID, line.Weight, offerHoldLifetime)
		if err != nil {
			return err
		}

		if !held {
			return apperr.Conflict("Insufficient available stock to fulfil this offer.")
		}
	}

	return nil
}

// Accept lets the buyer take the seller's offer: stock moves, a transaction is
// written and the request is closed, all in one go or not at all.
func (s *Service) Accept(ctx context.Context, user auth.User, id string) (string, error) {
	var transactionID string

	err := s.db.InTx(ctx, func(ctx context.Context) error {
		r, err := s.load(ctx, user, id, true)
		if err != nil {
			return err
		}

		if r.Buyer.ID != user.ID {
			return apperr.Forbidden("Only the buyer can accept an offer.")
		}

		if r.Status != StatusOffered {
			if r.Status == StatusPending {
				return transactions.ErrOfferRanOut
			}

			return apperr.Conflict("There is no active offer to accept.")
		}

		var lines []transactions.SaleItem

		for _, item := range r.Items {
			if item.OfferWeight != nil && item.OfferPrice != nil {
				lines = append(lines, transactions.SaleItem{
					MaterialID: item.MaterialID, Weight: *item.OfferWeight, Price: *item.OfferPrice,
				})
			}
		}

		if len(lines) == 0 {
			return transactions.ErrOfferRanOut
		}

		transactionID, err = s.trades.SettleOffer(ctx, r.Seller.ID, r.Buyer.ID, id, lines)
		if err != nil {
			return err
		}

		if err := s.store.SetStatus(ctx, id, StatusAccepted); err != nil {
			return err
		}

		name := firstName(r.Items)
		if len(lines) > 1 {
			name = fmt.Sprintf("%d materials", len(lines))
		}

		body := fmt.Sprintf("Your offer for %s has been accepted. "+
			"The transaction is complete.", name)

		return s.notes.Notify(ctx, r.Seller.ID, notifications.RequestAccepted,
			"Offer accepted!", body, "/market/"+id)
	})

	return transactionID, err
}

// move is one step of the state machine that only changes the status and
// tells the other side.
type move struct {
	actor  string // "seller" or "buyer"
	from   []string
	to     string
	denied string
	wrong  string
	kind   string
	title  string
	body   string // %s is the material name
	link   string // {id} is the request id
}

var moves = map[string]move{
	"decline": {
		actor: "buyer", from: []string{StatusOffered}, to: StatusPending,
		denied: "Only the buyer can decline an offer.", wrong: "There is no active offer to decline.",
		kind: notifications.RequestRejected, title: "Offer declined",
		body: "The buyer declined your offer for %s. You can make a new offer or reject the request.",
		link: "/market/{id}",
	},
	"withdraw": {
		actor: "seller", from: []string{StatusOffered}, to: StatusPending,
		denied: "Only the seller can withdraw an offer.", wrong: "There is no active offer to withdraw.",
		kind: notifications.RequestCancelled, title: "Offer withdrawn",
		body: "The seller withdrew their offer for %s. Negotiation continues.",
		link: "/market/{id}",
	},
	"reject": {
		actor: "seller", from: []string{StatusPending, StatusOffered}, to: StatusRejected,
		denied: "Only the seller can reject this request.",
		wrong:  "This request cannot be rejected in its current state.",
		kind:   notifications.RequestRejected, title: "Request rejected",
		body: "Your request for %s was not accepted.", link: "/market/outgoing",
	},
	"cancel": {
		actor: "buyer", from: []string{StatusPending, StatusOffered}, to: StatusCancelled,
		denied: "Only the buyer can cancel this request.",
		wrong:  "This request cannot be cancelled in its current state.",
		kind:   notifications.RequestCancelled, title: "Request cancelled",
		body: "A buyer cancelled their request for %s.", link: "/market/incoming",
	},
}

// Move runs one of the plain transitions: "decline", "withdraw", "reject" or
// "cancel". The caller must be the right side, and the request in the right
// status.
func (s *Service) Move(ctx context.Context, user auth.User, id, action string) error {
	step, known := moves[action]
	if !known {
		return apperr.BadRequest("Unknown action.", nil)
	}

	return s.db.InTx(ctx, func(ctx context.Context) error {
		r, err := s.load(ctx, user, id, true)
		if err != nil {
			return err
		}

		actor, other := r.Seller, r.Buyer
		if step.actor == "buyer" {
			actor, other = r.Buyer, r.Seller
		}

		if actor.ID != user.ID {
			return apperr.Forbidden(step.denied)
		}

		if !slices.Contains(step.from, r.Status) {
			return apperr.Conflict(step.wrong)
		}

		if err := s.store.ReleaseHolds(ctx, id); err != nil {
			return err
		}

		if err := s.store.ClearOffers(ctx, id); err != nil {
			return err
		}

		if err := s.store.SetStatus(ctx, id, step.to); err != nil {
			return err
		}

		link := strings.ReplaceAll(step.link, "{id}", id)
		body := fmt.Sprintf(step.body, firstName(r.Items))

		return s.notes.Notify(ctx, other.ID, step.kind, step.title, body, link)
	})
}
