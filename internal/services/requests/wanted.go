package requests

import (
	"context"
	"fmt"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/notifications"
	"github.com/connor-davis/3reco/internal/services/transactions"
	store "github.com/connor-davis/3reco/internal/stores/requests"
)

// WantedReply is a seller's answer to a wanted post, handed over by the wanted
// service with the post already locked and checked.
type WantedReply struct {
	PostID     string
	BuyerID    string
	MaterialID string
	Weight     string
	MaxPrice   *string
	Offer      []transactions.SaleItem
}

// CreateWantedReply opens an ordinary request from the post's buyer to the
// calling seller and makes the seller's offer on it, through the same rules as
// any offer (real listed stock, held for 48 hours). It must run inside the
// transaction that holds the post lock.
func (s *Service) CreateWantedReply(
	ctx context.Context,
	user auth.User,
	in WantedReply,
) (string, error) {
	id := database.NewID()

	err := s.store.InsertWanted(
		ctx, id, auth.PartyID(user), in.BuyerID, in.PostID, in.MaterialID, in.Weight, in.MaxPrice,
	)
	if err != nil {
		return "", err
	}

	r, err := s.store.Get(ctx, id, true)
	if err != nil {
		return "", err
	}

	line := in.Offer[0]
	event := fmt.Sprintf("%s replied to %s's wanted post for %s kg %s.",
		r.Seller.Name, r.Buyer.Name, in.Weight, firstName(r.Items))

	if err := s.store.InsertRequestEvent(ctx, id, user.ID, event); err != nil {
		return "", err
	}

	if err := s.applyOffer(ctx, user, r, in.Offer); err != nil {
		return "", err
	}

	body := fmt.Sprintf("%s offered %s kg %s at R %s / kg.",
		r.Seller.Name, line.Weight, firstName(r.Items), line.Price)

	err = s.notes.Notify(ctx, in.BuyerID, notifications.RequestReceived,
		"New reply to your wanted post", body, "/market/"+id)

	return id, err
}

// CancelWantedReplies ends every open reply of a locked post except one (pass
// an empty exceptID to end them all). Each seller is told, and each chat says
// who ended it. It runs in the caller's transaction.
func (s *Service) CancelWantedReplies(
	ctx context.Context,
	postID, exceptID, buyerID, event, title, body string,
) error {
	ended, err := s.store.CancelWantedReplies(ctx, postID, exceptID)
	if err != nil {
		return err
	}

	for _, reply := range ended {
		if err := s.notes.RequestEnded(ctx, reply.ID); err != nil {
			return err
		}

		if err := s.store.InsertRequestEvent(ctx, reply.ID, buyerID, event); err != nil {
			return err
		}

		err := s.notes.Notify(ctx, reply.SellerID, notifications.RequestCancelled,
			title, body, "/market/"+reply.ID)
		if err != nil {
			return err
		}
	}

	return nil
}

// lockWantedPost takes the post lock before the request lock, the same order
// the wanted service uses, when the request answers a wanted post.
func (s *Service) lockWantedPost(ctx context.Context, user auth.User, id string) error {
	r, err := s.load(ctx, user, id, false)
	if err != nil {
		return err
	}

	if r.WantedPostID == nil {
		return nil
	}

	return s.store.LockWantedPost(ctx, *r.WantedPostID)
}

// fillWantedPost runs when a reply is accepted: the post is filled and every
// other open reply is cancelled, in the same transaction as the trade.
func (s *Service) fillWantedPost(ctx context.Context, r store.Request) error {
	if err := s.store.SetWantedStatus(ctx, *r.WantedPostID, "filled"); err != nil {
		return err
	}

	return s.CancelWantedReplies(
		ctx,
		*r.WantedPostID,
		r.ID,
		r.Buyer.ID,
		r.Buyer.Name+" chose another reply, so this one is closed.",
		"Wanted post filled",
		"The buyer chose another seller for "+firstName(r.Items)+". Your stock is free again.",
	)
}
