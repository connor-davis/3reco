// Package requests holds the rules for buying requests: who may see one, how
// it moves from pending to offered to accepted, and the chat on it. Every
// change runs in one database transaction with its notification.
package requests

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/notifications"
	"github.com/connor-davis/3reco/internal/services/transactions"
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

	if r.Seller.ID != user.ID && r.Buyer.ID != user.ID {
		return store.Request{}, errNotFound
	}

	return r, nil
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
	if !staff && r.Seller.ID != user.ID && r.Buyer.ID != user.ID {
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
		return s.store.ListIncoming(ctx, user.ID, cur, limit)
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
		return s.store.ListOutgoing(ctx, user.ID, cur, limit)
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
}

// CreateInput is a new request: who sells, and which of their stock rows.
type CreateInput struct {
	SellerID string       `json:"seller_id"`
	Items    []CreateItem `json:"items"`
}

// Create opens a request from the caller to a seller and tells the seller.
func (s *Service) Create(ctx context.Context, user auth.User, in CreateInput) (string, error) {
	if in.SellerID == user.ID {
		return "", apperr.BadRequest("You cannot request your own listing.", nil)
	}

	if len(in.Items) == 0 || len(in.Items) > maxRequestItems {
		return "", apperr.Field("items", "Pick between 1 and 50 listings.")
	}

	id := database.NewID()

	err := s.db.InTx(ctx, func(ctx context.Context) error {
		active, err := s.store.ActiveUser(ctx, in.SellerID)
		if err != nil {
			return err
		}

		if !active {
			return apperr.BadRequest("That seller is not available.", nil)
		}

		items, err := s.checkListed(ctx, in)
		if err != nil {
			return err
		}

		if err := s.store.Insert(ctx, id, in.SellerID, user.ID, items); err != nil {
			return err
		}

		r, err := s.store.Get(ctx, id, false)
		if err != nil {
			return err
		}

		body := fmt.Sprintf("Someone is interested in your %s.", summary(r.Items))

		return s.notes.Notify(ctx, in.SellerID, notifications.RequestReceived,
			"New request received", body, "/market/incoming")
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
		items = append(items, store.NewItem{MaterialID: material, StockID: item.StockID})
	}

	return items, nil
}

// summary names what a request is about: the material, or a count.
func summary(items []store.Item) string {
	if len(items) == 1 {
		return items[0].MaterialName
	}

	return fmt.Sprintf("%d materials", len(items))
}

// firstName is the material the old app named in its messages.
func firstName(items []store.Item) string {
	if len(items) == 0 {
		return "stock"
	}

	return items[0].MaterialName
}
