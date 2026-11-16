// Package wanted holds the rules for wanted posts: who may post, who may see
// and answer, and how a post ends. A reply is an ordinary request (see
// services/requests), so it uses the same offer and two-party accept rules.
package wanted

import (
	"context"
	"errors"
	"math/big"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	marketsvc "github.com/connor-davis/3reco/internal/services/market"
	"github.com/connor-davis/3reco/internal/services/requests"
	"github.com/connor-davis/3reco/internal/services/transactions"
	marketstore "github.com/connor-davis/3reco/internal/stores/market"
	store "github.com/connor-davis/3reco/internal/stores/wanted"
)

// maxAreaLength is the longest rough area a buyer may type.
const maxAreaLength = 120

// The post statuses the rules check.
const (
	statusOpen    = "open"
	statusExpired = "expired" // open in the database, past its expiry
	statusClosed  = "closed"
)

var errNotFound = apperr.NotFound("Wanted post not found.")

// Service is the wanted post rules.
type Service struct {
	db       *database.DB
	store    *store.Store
	requests *requests.Service
}

// New builds the service.
func New(db *database.DB, s *store.Store, r *requests.Service) *Service {
	return &Service{db: db, store: s, requests: r}
}

// CreateInput is a new post. Days is how long it stays open: 7, 14 or 30.
type CreateInput struct {
	MaterialID string `json:"material_id"`
	Weight     string `json:"weight"`
	MaxPrice   string `json:"max_price"`
	Area       string `json:"area"`
	Days       int    `json:"days"`
}

// Create posts what the caller's business wants to buy.
func (s *Service) Create(ctx context.Context, user auth.User, in CreateInput) (string, error) {
	area := strings.TrimSpace(in.Area)

	if in.MaterialID == "" {
		return "", apperr.Field("material_id", "Pick a material.")
	}

	line := transactions.SaleItem{MaterialID: in.MaterialID, Weight: in.Weight, Price: "0"}

	// An empty ceiling means "any price"; otherwise it is checked like a price.
	var maxPrice *string

	if in.MaxPrice != "" {
		line.Price = in.MaxPrice
		maxPrice = &in.MaxPrice
	}

	if err := transactions.CheckItems([]transactions.SaleItem{line}); err != nil {
		return "", err
	}

	if area == "" || utf8.RuneCountInString(area) > maxAreaLength {
		return "", apperr.Field("area", "Type a rough area, up to 120 characters.")
	}

	if !slices.Contains([]int{7, 14, 30}, in.Days) {
		return "", apperr.Field("days", "Choose 7, 14 or 30 days.")
	}

	id := database.NewID()

	found, err := s.store.Insert(ctx, store.NewPost{
		ID: id, BuyerID: auth.PartyID(user), MaterialID: in.MaterialID, Weight: in.Weight,
		MaxPrice: maxPrice, Area: area, Days: in.Days,
	})
	if err != nil {
		return "", err
	}

	if !found {
		return "", apperr.Field("material_id", "Pick a material from the list.")
	}

	return id, nil
}

// Mine lists the caller's own posts in every state.
func (s *Service) Mine(
	ctx context.Context,
	user auth.User,
	cursor string,
	limit int,
) (paging.Page[store.Post], error) {
	cur, err := paging.ParseCursor(cursor)
	if err != nil {
		return paging.Page[store.Post]{}, err
	}

	rows, err := s.store.Mine(ctx, auth.PartyID(user), cur, limit)
	if err != nil {
		return paging.Page[store.Post]{}, err
	}

	return paging.Build(rows, limit, postKey), nil
}

// Discover lists the open posts of other businesses for a verified business.
func (s *Service) Discover(
	ctx context.Context,
	user auth.User,
	materialID, cursor string,
	limit int,
) (paging.Page[store.Post], error) {
	if err := s.requireSeller(ctx, user); err != nil {
		return paging.Page[store.Post]{}, err
	}

	cur, err := paging.ParseCursor(cursor)
	if err != nil {
		return paging.Page[store.Post]{}, err
	}

	rows, err := s.store.Discover(ctx, auth.PartyID(user), materialID, cur, limit)
	if err != nil {
		return paging.Page[store.Post]{}, err
	}

	return paging.Build(rows, limit, postKey), nil
}

func postKey(p store.Post) (time.Time, string) { return p.CreatedAt, p.ID }

// requireSeller lets only a verified business see posts and reply to them.
func (s *Service) requireSeller(ctx context.Context, user auth.User) error {
	return marketsvc.RequireVerified(ctx, marketstore.New(s.db), auth.PartyID(user))
}

// own returns the caller's post, or the same 404 as a missing one.
func (s *Service) own(
	ctx context.Context,
	user auth.User,
	id string,
	lock bool,
) (store.Post, error) {
	p, err := s.store.Get(ctx, id, lock)
	if errors.Is(err, store.ErrNotFound) || (err == nil && p.BuyerID != auth.PartyID(user)) {
		return p, errNotFound
	}

	return p, err
}

// Replies lists the replies to one of the caller's posts.
func (s *Service) Replies(ctx context.Context, user auth.User, id string) ([]store.Reply, error) {
	if _, err := s.own(ctx, user, id, false); err != nil {
		return nil, err
	}

	return s.store.Replies(ctx, id)
}

// Close ends an open post and cancels the replies still open, telling each seller.
func (s *Service) Close(ctx context.Context, user auth.User, id string) error {
	return s.db.InTx(ctx, func(ctx context.Context) error {
		p, err := s.own(ctx, user, id, true)
		if err != nil {
			return err
		}

		if p.Status != statusOpen && p.Status != statusExpired {
			return apperr.Conflict("This post is already closed.")
		}

		err = s.requests.CancelWantedReplies(
			ctx,
			id,
			"",
			p.BuyerID,
			"The buyer closed this wanted post, so this reply is closed.",
			"Wanted post closed",
			"The buyer closed their wanted post for "+p.MaterialName+". Your stock is free again.",
		)
		if err != nil {
			return err
		}

		return s.store.SetStatus(ctx, id, statusClosed)
	})
}

// Reply answers a post with an offer. It opens an ordinary request, so the two
// sides then chat and accept as for any request.
func (s *Service) Reply(
	ctx context.Context,
	user auth.User,
	id string,
	offer []transactions.SaleItem,
) (string, error) {
	var requestID string

	err := s.db.InTx(ctx, func(ctx context.Context) error {
		if err := s.requireSeller(ctx, user); err != nil {
			return err
		}

		p, err := s.store.Get(ctx, id, true)
		if errors.Is(err, store.ErrNotFound) {
			return errNotFound
		}

		if err != nil {
			return err
		}

		if p.BuyerID == auth.PartyID(user) {
			return apperr.Forbidden("You cannot reply to your own wanted post.")
		}

		if p.Status != statusOpen {
			if p.Status == statusExpired || p.Status == statusClosed {
				return apperr.Conflict("This wanted post is closed or has expired.")
			}

			return apperr.Conflict("This wanted post has been filled.")
		}

		active, err := s.store.BuyerActive(ctx, p.BuyerID)
		if err != nil {
			return err
		}

		if !active {
			return errNotFound
		}

		if err := checkReply(p, offer); err != nil {
			return err
		}

		replied, err := s.store.HasReply(ctx, id, auth.PartyID(user))
		if err != nil {
			return err
		}

		if replied {
			return apperr.Conflict("You already replied to this wanted post.")
		}

		requestID, err = s.requests.CreateWantedReply(ctx, user, requests.WantedReply{
			PostID: id, BuyerID: p.BuyerID, MaterialID: p.MaterialID, Weight: p.Weight,
			MaxPrice: p.MaxPrice, Offer: offer,
		})

		return err
	})

	return requestID, err
}

// checkReply makes sure the offer is one line for the post's material, at or
// under the buyer's price ceiling. The offer rules do the rest.
func checkReply(p store.Post, offer []transactions.SaleItem) error {
	if len(offer) != 1 {
		return apperr.Field("items", "Make one offer for the material that was asked for.")
	}

	if offer[0].MaterialID != p.MaterialID {
		return apperr.Field("items", "That material is not part of this wanted post.")
	}

	if err := transactions.CheckPricedItems(offer); err != nil {
		return err
	}

	if p.MaxPrice != nil {
		ceiling, _ := new(big.Rat).SetString(*p.MaxPrice)
		price, _ := new(big.Rat).SetString(offer[0].Price)

		if price.Cmp(ceiling) > 0 {
			return apperr.Field("price", "Your price is above the most the buyer will pay.")
		}
	}

	return nil
}
