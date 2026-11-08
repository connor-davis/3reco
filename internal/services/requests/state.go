package requests

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/pdf"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/notifications"
	"github.com/connor-davis/3reco/internal/services/transactions"
	store "github.com/connor-davis/3reco/internal/stores/requests"
)

// MakeOffer lets either participant put weights and prices on an open request. The
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

		if r.Status == StatusOffered && r.OfferBy != nil && *r.OfferBy == user.ID {
			return apperr.Forbidden("Wait for the other side to respond, or withdraw your offer.")
		}

		if r.Status != StatusPending && r.Status != StatusOffered {
			return apperr.Conflict("An offer can only be made on an open request.")
		}

		if err := transactions.CheckPricedItems(offer); err != nil {
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

		if err := s.store.ResetConfirmation(ctx, id); err != nil {
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

		if err := s.store.StartOffer(ctx, id, user.ID); err != nil {
			return err
		}

		name := firstName(r.Items)
		if len(offer) > 1 {
			name = fmt.Sprintf("%d materials", len(offer))
		}

		body := fmt.Sprintf("A new offer was made for %s. Review the terms and confirm or counter.", name)

		actor := r.Seller.Name
		if user.ID == r.Buyer.ID {
			actor = r.Buyer.Name
		}
		action := " made an offer for "
		if r.Status == StatusOffered {
			action = " made a counter-offer for "
		}
		if err := s.store.InsertRequestEvent(ctx, id, user.ID, actor+action+name+"."); err != nil {
			return err
		}

		other := r.Buyer.ID
		if user.ID == other {
			other = r.Seller.ID
		}

		return s.notes.Notify(ctx, other, notifications.RequestAccepted,
			"Offer received", body, "/market/"+id)
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

// Accept confirms the current version. The recipient confirms first; settlement
// happens only when the offer maker also confirms, under the same request lock.
func (s *Service) Accept(
	ctx context.Context,
	user auth.User,
	id string,
	version ...int,
) (string, error) {
	var transactionID string

	err := s.db.InTx(ctx, func(ctx context.Context) error {
		r, err := s.load(ctx, user, id, true)
		if err != nil {
			return err
		}

		if r.Status != StatusOffered {
			if r.Status == StatusPending {
				return transactions.ErrOfferRanOut
			}

			return apperr.Conflict("There is no active offer to accept.")
		}

		if len(version) > 0 && version[0] != r.OfferVersion {
			return apperr.Conflict("The offer changed. Review the latest terms before confirming.")
		}

		if r.OfferBy == nil {
			return transactions.ErrOfferRanOut
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

		buyerConfirmed := r.BuyerConfirmedVersion != nil && *r.BuyerConfirmedVersion == r.OfferVersion
		sellerConfirmed := r.SellerConfirmedVersion != nil && *r.SellerConfirmedVersion == r.OfferVersion
		if (user.ID == r.Buyer.ID && buyerConfirmed) || (user.ID == r.Seller.ID && sellerConfirmed) {
			return apperr.Conflict("You already confirmed this offer.")
		}
		if !buyerConfirmed && !sellerConfirmed && (r.OfferBy == nil || *r.OfferBy == user.ID) {
			return apperr.Forbidden("The other side must accept your offer first.")
		}

		live, err := s.store.LiveHolds(ctx, id, len(lines))
		if err != nil {
			return err
		}
		if !live {
			return transactions.ErrOfferRanOut
		}
		if err := s.store.Confirm(ctx, r, user.ID); err != nil {
			return err
		}

		other := r.Seller.ID
		if user.ID == other {
			other = r.Buyer.ID
		}
		if !buyerConfirmed && !sellerConfirmed {
			transactionID, err = s.trades.BeginOffer(ctx, r.Seller.ID, r.Buyer.ID, id, r.OfferVersion, lines)
			if err != nil {
				return err
			}

			return s.notes.Notify(
				ctx,
				other,
				notifications.RequestAccepted,
				"Please confirm the offer",
				"They accepted this offer. Please confirm to complete the deal.",
				"/market/"+id,
			)
		}

		transactionID, err = s.trades.CompleteOffer(
			ctx,
			r.Seller.ID,
			r.Buyer.ID,
			id,
			r.OfferVersion,
			lines,
		)
		if err != nil {
			return err
		}

		if err := s.store.SetStatus(ctx, id, StatusAccepted); err != nil {
			return err
		}

		if err := s.notes.RequestEnded(ctx, id); err != nil {
			return err
		}

		// The chat's last line (and so the inbox preview and time) says it is done.
		if err := s.store.InsertRequestEvent(ctx, id, user.ID, "The trade is complete."); err != nil {
			return err
		}

		trade, err := s.trades.Detail(ctx, user, transactionID)
		if err != nil {
			return err
		}

		first := trade.Items[0]
		weight := first.Weight
		if strings.Contains(weight, ".") {
			weight = strings.TrimRight(strings.TrimRight(weight, "0"), ".")
		}
		name := pdf.Grouped(weight) + " kg " + first.MaterialName
		if len(trade.Items) > 1 {
			name += fmt.Sprintf(" and %d more", len(trade.Items)-1)
		} else {
			name += " at R " + pdf.Grouped(pdf.Decimal(first.Price)) + " / kg"
		}

		body := fmt.Sprintf("Your trade for %s is complete: R %s.",
			name, pdf.Grouped(pdf.Decimal(trade.TotalPrice)))

		return s.notes.Notify(ctx, other, notifications.RequestAccepted,
			"Trade complete", body, "/market/"+id)
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
	event  string // the chat line; %s is who acted
	link   string // {id} is the request id
}

var moves = map[string]move{
	"decline": {
		actor: "buyer", from: []string{StatusOffered}, to: StatusPending,
		denied: "Only the buyer can decline an offer.", wrong: "There is no active offer to decline.",
		kind: notifications.RequestRejected, title: "Offer declined",
		body:  "The buyer declined your offer for %s. You can make a new offer or reject the request.",
		event: "%s declined the offer.",
		link:  "/market/{id}",
	},
	"withdraw": {
		actor: "seller", from: []string{StatusOffered}, to: StatusPending,
		denied: "Only the seller can withdraw an offer.", wrong: "There is no active offer to withdraw.",
		kind: notifications.RequestCancelled, title: "Offer withdrawn",
		body:  "The offer for %s was withdrawn. Negotiation continues.",
		event: "%s withdrew the offer.",
		link:  "/market/{id}",
	},
	"reject": {
		actor: "seller", from: []string{StatusPending, StatusOffered}, to: StatusRejected,
		denied: "Only the seller can reject this request.",
		wrong:  "This request cannot be rejected in its current state.",
		kind:   notifications.RequestRejected, title: "Request rejected",
		body: "The request for %s was rejected.", event: "%s rejected this request.",
		link: "/market/{id}",
	},
	"cancel": {
		actor: "buyer", from: []string{StatusPending, StatusOffered}, to: StatusCancelled,
		denied: "Only the buyer can cancel this request.",
		wrong:  "This request cannot be cancelled in its current state.",
		kind:   notifications.RequestCancelled, title: "Request cancelled",
		body: "A buyer cancelled their request for %s.", event: "%s cancelled this request.",
		link: "/market/incoming",
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

		if action == "decline" && r.OfferBy != nil && *r.OfferBy == user.ID {
			return apperr.Forbidden("Only the other side can decline your offer.")
		}

		if action == "withdraw" && r.OfferBy != nil && *r.OfferBy == user.ID {
			actor.ID = user.ID
			other = r.Buyer
			if user.ID == r.Buyer.ID {
				other = r.Seller
			}
		} else if action == "withdraw" {
			return apperr.Forbidden("Only the offer maker can withdraw it.")
		}
		if (action == "reject" || action == "decline") && r.Status == StatusOffered && r.OfferBy != nil && *r.OfferBy != user.ID {
			actor.ID = user.ID
			other = r.Buyer
			if user.ID == r.Buyer.ID {
				other = r.Seller
			}
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

		if err := s.store.ResetConfirmation(ctx, id); err != nil {
			return err
		}

		if err := s.store.ClearOffers(ctx, id); err != nil {
			return err
		}

		if err := s.store.SetStatus(ctx, id, step.to); err != nil {
			return err
		}

		if action == "withdraw" {
			if err := s.reserveRequestedHolds(ctx, r); err != nil {
				return err
			}
		}

		// Whatever the move, the offer it answers is gone.
		if step.to == StatusRejected || step.to == StatusCancelled {
			if err := s.notes.RequestEnded(ctx, id); err != nil {
				return err
			}
		} else if err := s.notes.OffersEnded(ctx, id); err != nil {
			return err
		}

		// The chat keeps a record of who ended the request, for both sides.
		name := r.Seller.Name
		if user.ID == r.Buyer.ID {
			name = r.Buyer.Name
		}
		event := fmt.Sprintf(step.event, name)
		if err := s.store.InsertRequestEvent(ctx, id, user.ID, event); err != nil {
			return err
		}

		link := strings.ReplaceAll(step.link, "{id}", id)
		body := fmt.Sprintf(step.body, firstName(r.Items))

		return s.notes.Notify(ctx, other.ID, step.kind, step.title, body, link)
	})
}
