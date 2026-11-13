// Package requests holds the rules for buying requests: who may see one, how
// it moves from pending to offered to accepted, and the chat on it. Every
// change runs in one database transaction with its notification.
package requests

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"slices"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	marketsvc "github.com/connor-davis/3reco/internal/services/market"
	"github.com/connor-davis/3reco/internal/services/notifications"
	"github.com/connor-davis/3reco/internal/services/transactions"
	marketstore "github.com/connor-davis/3reco/internal/stores/market"
	store "github.com/connor-davis/3reco/internal/stores/requests"
)

// The statuses a request moves through.
const (
	StatusPending   = "pending"
	StatusOffered   = "offered"
	StatusAccepted  = "accepted"
	StatusRejected  = "rejected"
	StatusCancelled = "cancelled"
)

const maxRequestItems = 50

// Service is the request rules.
type Service struct {
	db     *database.DB
	store  *store.Store
	trades *transactions.Service
	notes  *notifications.Service
}

// New builds the service.
func New(
	db *database.DB,
	s *store.Store,
	trades *transactions.Service,
	notes *notifications.Service,
) *Service {
	return &Service{db: db, store: s, trades: trades, notes: notes}
}

var errNotFound = apperr.NotFound("Request not found.")

// load returns a request the user takes part in. A stranger gets the same 404
// as for an id that does not exist, so ids cannot be probed. With lock set the
// request row stays locked until the surrounding transaction ends.
func (s *Service) load(
	ctx context.Context,
	user auth.User,
	id string,
	lock bool,
) (store.Request, error) {
	r, err := s.store.Get(ctx, id, lock)
	if errors.Is(err, store.ErrNotFound) {
		return r, errNotFound
	}

	if err != nil {
		return r, err
	}

	if r.Seller.ID != auth.PartyID(user) && r.Buyer.ID != auth.PartyID(user) {
		// An admin may read any chat but never act on one.
		if auth.HasRole(user, auth.RoleAdmin) {
			return store.Request{}, errAdminReadOnly
		}

		return store.Request{}, errNotFound
	}

	return r, nil
}

var errAdminReadOnly = apperr.Forbidden("You are viewing this chat as an admin. Admins cannot act on it.")

// loadForRead is load for reading only: an admin may also read a request they
// take no part in.
func (s *Service) loadForRead(
	ctx context.Context,
	user auth.User,
	id string,
) (store.Request, error) {
	if !auth.HasRole(user, auth.RoleAdmin) {
		return s.load(ctx, user, id, false)
	}

	r, err := s.store.Get(ctx, id, false)
	if errors.Is(err, store.ErrNotFound) {
		return r, errNotFound
	}

	return r, err
}

// Get returns a request to its two sides, and to admin and staff.
func (s *Service) Get(ctx context.Context, user auth.User, id string) (store.Request, error) {
	r, err := s.store.Get(ctx, id, false)
	if errors.Is(err, store.ErrNotFound) {
		return r, errNotFound
	}

	if err != nil {
		return r, err
	}

	staff := auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff)
	if !staff && r.Seller.ID != auth.PartyID(user) && r.Buyer.ID != auth.PartyID(user) {
		return store.Request{}, errNotFound
	}

	return r, nil
}

func requestKey(r store.Request) (time.Time, string) { return r.CreatedAt, r.ID }

// Incoming lists the requests other people made to the caller.
func (s *Service) Incoming(
	ctx context.Context,
	user auth.User,
	cursor string,
	limit int,
) (paging.Page[store.Request], error) {
	return s.page(cursor, limit, func(cur paging.Cursor) ([]store.Request, error) {
		return s.store.ListIncoming(ctx, auth.PartyID(user), cur, limit)
	})
}

// Outgoing lists the requests the caller made.
func (s *Service) Outgoing(
	ctx context.Context,
	user auth.User,
	cursor string,
	limit int,
) (paging.Page[store.Request], error) {
	return s.page(cursor, limit, func(cur paging.Cursor) ([]store.Request, error) {
		return s.store.ListOutgoing(ctx, auth.PartyID(user), cur, limit)
	})
}

func (s *Service) page(
	cursor string,
	limit int,
	fetch func(paging.Cursor) ([]store.Request, error),
) (paging.Page[store.Request], error) {
	cur, err := paging.ParseCursor(cursor)
	if err != nil {
		return paging.Page[store.Request]{}, err
	}

	rows, err := fetch(cur)
	if err != nil {
		return paging.Page[store.Request]{}, err
	}

	return paging.Build(rows, limit, requestKey), nil
}

// CreateItem is one requested stock row.
type CreateItem struct {
	MaterialID string `json:"material_id"`
	StockID    string `json:"stock_id"`
	Weight     string `json:"weight"`
}

// CreateInput is a new request: who sells, and which of their stock rows.
type CreateInput struct {
	FromCart bool         `json:"from_cart"`
	SellerID string       `json:"seller_id"`
	Items    []CreateItem `json:"items"`
}

// Create opens a request from the caller to a seller and tells the seller.
func (s *Service) Create(ctx context.Context, user auth.User, in CreateInput) (string, error) {
	if in.SellerID == auth.PartyID(user) {
		return "", apperr.BadRequest("You cannot request your own listing.", nil)
	}

	if (!in.FromCart && len(in.Items) == 0) || len(in.Items) > maxRequestItems {
		return "", apperr.Field("items", "Pick between 1 and 50 listings.")
	}

	id := database.NewID()

	err := s.db.InTx(ctx, func(ctx context.Context) error {
		if in.FromCart {
			cart, err := marketstore.New(s.db).Cart(ctx, auth.PartyID(user), in.SellerID)
			if err != nil {
				return err
			}

			materials := make(map[string]bool, len(cart.Items))
			for _, item := range cart.Items {
				materials[item.MaterialID] = true
			}

			for _, item := range in.Items {
				if !materials[item.MaterialID] {
					return apperr.Conflict("Your cart changed. Check it and send again.")
				}
				delete(materials, item.MaterialID)
			}

			if len(materials) != 0 {
				return apperr.Conflict("Your cart changed. Check it and send again.")
			}
		}

		if len(in.Items) == 0 {
			return apperr.Field("items", "Pick between 1 and 50 listings.")
		}

		active, err := s.store.ActiveUser(ctx, in.SellerID)
		if err != nil {
			return err
		}

		if !active {
			return apperr.BadRequest("That seller is not available.", nil)
		}

		if err := marketsvc.RequireVerified(ctx, marketstore.New(s.db), in.SellerID); err != nil {
			return err
		}

		items, err := s.checkListed(ctx, in)
		if err != nil {
			return err
		}

		if err := s.store.Insert(ctx, id, in.SellerID, auth.PartyID(user), items); err != nil {
			return err
		}

		r, err := s.store.Get(ctx, id, false)
		if err != nil {
			return err
		}

		slices.SortFunc(r.Items, func(a, b store.Item) int {
			return strings.Compare(a.MaterialID, b.MaterialID)
		})

		// The cart's hold becomes the request's hold in this one transaction, so
		// the stock is never free in between. The cart goes with it.
		if in.FromCart {
			if err := marketstore.New(s.db).ClearCart(ctx, auth.PartyID(user), in.SellerID); err != nil {
				return err
			}
		}

		var terms []string
		for _, item := range r.Items {
			held, err := s.store.ReserveHold(
				ctx,
				r,
				item.MaterialID,
				*item.RequestedWeight,
				offerHoldLifetime,
			)
			if err != nil {
				return err
			}

			if !held {
				return apperr.Conflict("Insufficient available stock for this request.")
			}

			price, ok := new(big.Rat).SetString(*item.RequestedPrice)
			if !ok {
				return errors.New("stored request price is invalid")
			}

			term := fmt.Sprintf(
				"%s: %s kg at R %s / kg",
				item.MaterialName,
				*item.RequestedWeight,
				price.FloatString(2),
			)
			terms = append(terms, term)
		}

		body := strings.Join(terms, "; ")
		var requested []string
		for _, item := range r.Items {
			requested = append(requested, *item.RequestedWeight+" kg "+item.MaterialName)
		}

		if err := s.store.InsertRequestEvent(ctx, id, user.ID,
			r.Buyer.Name+" requested "+strings.Join(requested, "; ")); err != nil {
			return err
		}

		return s.notes.Notify(ctx, in.SellerID, notifications.RequestReceived,
			"New request received", body, "/market/"+id)
	})
	if err != nil {
		return "", err
	}

	return id, nil
}

// checkListed makes sure every asked-for stock row is the seller's, is on the
// market, and holds the material the caller named. A material may only be
// asked for once, because offers are matched by material.
func (s *Service) checkListed(ctx context.Context, in CreateInput) ([]store.NewItem, error) {
	bad := apperr.Field("items", "One of those listings is not available.")

	stockIDs := make([]string, len(in.Items))
	for i, item := range in.Items {
		stockIDs[i] = item.StockID
	}

	listed, err := s.store.ListedStock(ctx, in.SellerID, stockIDs)
	if err != nil {
		return nil, err
	}

	items := make([]store.NewItem, 0, len(in.Items))
	seenStock, seenMaterial := map[string]bool{}, map[string]bool{}

	for _, item := range in.Items {
		material, found := listed[item.StockID]
		if !found || (item.MaterialID != "" && item.MaterialID != material) {
			return nil, bad
		}

		if seenStock[item.StockID] || seenMaterial[material] {
			return nil, apperr.Field("items", "Each listing can only be picked once.")
		}

		seenStock[item.StockID], seenMaterial[material] = true, true
		line := transactions.SaleItem{MaterialID: material, Weight: item.Weight, Price: "0"}
		if err := transactions.CheckItems([]transactions.SaleItem{line}); err != nil {
			return nil, err
		}

		items = append(items, store.NewItem{
			MaterialID: material, StockID: item.StockID, Weight: item.Weight,
		})
	}

	return items, nil
}

// firstName is the material the old app named in its messages.
func firstName(items []store.Item) string {
	if len(items) == 0 {
		return "stock"
	}

	return items[0].MaterialName
}
