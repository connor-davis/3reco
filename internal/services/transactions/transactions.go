// Package transactions holds the rules for finished trades: who may see a
// transaction, the lists each role gets, and (in sales.go) how a sale moves
// stock. Every list names its own scope; there is no fallback that returns
// everyone's rows.
package transactions

import (
	"context"
	"errors"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/services/auth"
	store "github.com/connor-davis/3reco/internal/stores/transactions"
)

// InvoiceHook is called after a commit whenever a transaction's invoice must
// be built or rebuilt. T10 (invoices) sets it; until then nothing runs.
type InvoiceHook func(transactionID string, notifyBuyer bool)

// Service is the transaction rules.
type Service struct {
	db      *database.DB
	store   *store.Store
	invoice InvoiceHook
}

// New builds the service.
func New(db *database.DB, s *store.Store) *Service { return &Service{db: db, store: s} }

// SetInvoiceHook sets what runs after a commit that needs an invoice. Call it
// once at start-up, before the server takes requests.
func (s *Service) SetInvoiceHook(hook InvoiceHook) { s.invoice = hook }

// QueueInvoice schedules the invoice hook for after the transaction in ctx
// commits, so a rolled-back sale never makes an invoice.
func (s *Service) QueueInvoice(ctx context.Context, transactionID string, notifyBuyer bool) {
	database.AfterCommit(ctx, func() {
		if s.invoice != nil {
			s.invoice(transactionID, notifyBuyer)
		}
	})
}

// The lists a caller can ask for.
const (
	KindPurchases = "purchases"
	KindSales     = "sales"
	KindMine      = "mine"
)

var errNotFound = apperr.NotFound("Transaction not found.")

// List returns one page of the caller's transactions. Purchases and sales
// are business (and, for sales, collector) lists; everyone else has to use
// "mine", which admin and staff widen to every transaction.
func (s *Service) List(
	ctx context.Context,
	user auth.User,
	kind, cursor string,
	limit int,
	in ListFilter,
) (paging.Page[store.Transaction], error) {
	var empty paging.Page[store.Transaction]

	cur, err := paging.ParseCursor(cursor)
	if err != nil {
		return empty, err
	}

	filter, err := in.parse()
	if err != nil {
		return empty, err
	}

	scope, owner, err := s.scope(ctx, user, kind)
	if err != nil {
		return empty, err
	}

	// A collector with no linked collector row has sold nothing.
	if owner == "" {
		return paging.Build([]store.Transaction{}, limit, nil), nil
	}

	rows, err := s.store.List(ctx, scope, owner, filter, cur, limit)
	if err != nil {
		return empty, err
	}

	return paging.Build(rows, limit, func(t store.Transaction) (time.Time, string) {
		return t.CreatedAt, t.ID
	}), nil
}

// scope picks the SQL scope and the id it filters on (owner). An empty owner
// means "nothing to show".
func (s *Service) scope(
	ctx context.Context,
	user auth.User,
	kind string,
) (store.Scope, string, error) {
	denied := apperr.Forbidden("You are not allowed to see these transactions.")

	switch kind {
	case KindPurchases:
		if !auth.HasRole(user, auth.RoleBusiness) {
			return "", "", denied
		}

		return store.ScopePurchases, user.ID, nil

	case KindSales:
		if auth.HasRole(user, auth.RoleBusiness) {
			return store.ScopeBusinessSales, user.ID, nil
		}

		if !auth.HasRole(user, auth.RoleCollector) {
			return "", "", denied
		}

		// c2b rows store the collector's id, not the user's.
		collectorID, found, err := s.store.CollectorForUser(ctx, user.ID)
		if err != nil {
			return "", "", err
		}

		if !found {
			return "", "", nil
		}

		return store.ScopeCollectorSales, collectorID, nil

	default:
		if auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff) {
			return store.ScopeAll, user.ID, nil
		}

		return store.ScopeMine, user.ID, nil
	}
}

// canRead is the one rule for seeing a transaction: staff, its buyer, or the
// seller of a business trade. A collector seller has no login.
func canRead(user auth.User, t store.Transaction) bool {
	return auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff) ||
		t.Buyer.ID == user.ID ||
		(t.Type == "b2b" && t.Seller.ID == user.ID)
}

// Detail returns one transaction the caller may see. Anyone else gets the
// same 404 as for an id that does not exist.
func (s *Service) Detail(ctx context.Context, user auth.User, id string) (store.Transaction, error) {
	t, err := s.store.Get(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return t, errNotFound
	}

	if err != nil {
		return t, err
	}

	if !canRead(user, t) {
		return store.Transaction{}, errNotFound
	}

	return t, nil
}

// Participant is Detail for actions only the two sides of a trade may take
// (receipts): staff may read a transaction but never attach to one.
func (s *Service) Participant(
	ctx context.Context,
	user auth.User,
	id string,
) (store.Transaction, error) {
	t, err := s.Detail(ctx, user, id)
	if err != nil {
		return t, err
	}

	if t.Buyer.ID != user.ID && !(t.Type == "b2b" && t.Seller.ID == user.ID) {
		return store.Transaction{}, errNotFound
	}

	if t.Status != "complete" {
		return store.Transaction{}, apperr.Conflict("Receipts are available once the deal is complete.")
	}

	return t, nil
}
