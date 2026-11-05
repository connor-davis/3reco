package transactions

import (
	"context"
	"math/big"
	"slices"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	store "github.com/connor-davis/3reco/internal/stores/transactions"
)

var (
	errBelowBase    = apperr.BadRequest("Price must be at or above the base material price.", nil)
	errNoStock      = apperr.BadRequest("Insufficient stock to complete this transaction.", nil)
	errNoMaterial   = apperr.BadRequest("Material not found.", nil)
	errBuyerInvalid = apperr.BadRequest("The selected business is not available.", nil)
)

// DirectSale records a business selling stock straight to another business.
// The seller is always the caller, never something the body says.
func (s *Service) DirectSale(
	ctx context.Context,
	user auth.User,
	buyerID string,
	items []SaleItem,
) (string, error) {
	if !auth.HasRole(user, auth.RoleBusiness) {
		return "", apperr.Forbidden("Only businesses can sell stock.")
	}

	if buyerID == user.ID {
		return "", apperr.BadRequest("You cannot sell to yourself.", nil)
	}

	if err := CheckItems(items); err != nil {
		return "", err
	}

	var id string

	err := s.db.InTx(ctx, func(ctx context.Context) error {
		active, err := s.store.ActiveBusiness(ctx, buyerID)
		if err != nil {
			return err
		}

		if !active {
			return errBuyerInvalid
		}

		id, err = s.settle(ctx, user.ID, buyerID, items, true)

		return err
	})

	return id, err
}

// SettleOffer turns an accepted offer into a transaction. The price was
// agreed in the offer, so it is not checked against the base price again.
// Call it inside the transaction that also marks the request accepted.
func (s *Service) SettleOffer(
	ctx context.Context,
	sellerID, buyerID string,
	items []SaleItem,
) (string, error) {
	if err := CheckItems(items); err != nil {
		return "", err
	}

	var id string

	err := s.db.InTx(ctx, func(ctx context.Context) error {
		var err error

		id, err = s.settle(ctx, sellerID, buyerID, items, false)

		return err
	})

	return id, err
}

// CheckOffer tells a seller early that an offer line cannot work: price under
// the base price, or more weight than the seller holds. The same checks run
// again, under a lock, when the offer is accepted.
func (s *Service) CheckOffer(ctx context.Context, sellerID string, item SaleItem) error {
	if err := CheckItems([]SaleItem{item}); err != nil {
		return err
	}

	if err := s.checkBase(ctx, item); err != nil {
		return err
	}

	_, held, found, err := s.store.LockStock(ctx, sellerID, item.MaterialID)
	if err != nil {
		return err
	}

	if !found || ratOf(held).Cmp(ratOf(item.Weight)) < 0 {
		return apperr.BadRequest("Insufficient stock to fulfil this offer.", nil)
	}

	return nil
}

func ratOf(decimal string) *big.Rat {
	value, _ := new(big.Rat).SetString(decimal)

	return value
}

func (s *Service) checkBase(ctx context.Context, item SaleItem) error {
	base, found, err := s.store.MaterialPrice(ctx, item.MaterialID)
	if err != nil {
		return err
	}

	if !found {
		return errNoMaterial
	}

	if ratOf(item.Price).Cmp(ratOf(base)) < 0 {
		return errBelowBase
	}

	return nil
}

// settle writes one business-to-business transaction and moves the stock. It
// must run inside a database transaction: any error rolls every write back.
func (s *Service) settle(
	ctx context.Context,
	sellerID, buyerID string,
	items []SaleItem,
	checkBase bool,
) (string, error) {
	// Rows are locked in material order, so two sales that share materials
	// cannot wait on each other for ever.
	sorted := slices.Clone(items)
	slices.SortFunc(sorted, func(a, b SaleItem) int { return strings.Compare(a.MaterialID, b.MaterialID) })

	id := database.NewID()

	err := s.store.Insert(ctx, store.NewTransaction{
		ID: id, SellerID: sellerID, BuyerID: buyerID, Type: "b2b",
	})
	if err != nil {
		return "", err
	}

	for position, item := range sorted {
		if checkBase {
			if err := s.checkBase(ctx, item); err != nil {
				return "", err
			}
		}

		stockID, _, found, err := s.store.LockStock(ctx, sellerID, item.MaterialID)
		if err != nil {
			return "", err
		}

		if !found {
			return "", errNoStock
		}

		taken, err := s.store.Take(ctx, stockID, item.Weight)
		if err != nil {
			return "", err
		}

		if !taken {
			return "", errNoStock
		}

		err = s.store.Give(ctx, buyerID, item.MaterialID, item.Weight, item.Price, database.NewID())
		if err != nil {
			return "", err
		}

		err = s.store.InsertItem(ctx, id, position, item.MaterialID, item.Weight, item.Price)
		if err != nil {
			return "", err
		}
	}

	if err := s.store.SetTotal(ctx, id); err != nil {
		return "", err
	}

	s.QueueInvoice(ctx, id, true)

	return id, nil
}

// CollectionInput is what a collector sale needs. CollectionDate is when the
// material was collected; CollectionDay is the same as a plain calendar day.
type CollectionInput struct {
	CollectorID    string     `json:"collector_id"`
	BusinessID     string     `json:"business_id"`
	Items          []SaleItem `json:"items"`
	CollectionDay  *string    `json:"collection_day"`
	CollectionDate *time.Time `json:"collection_date"`
}

// CollectorSale records a business (or, for one, staff) buying from a
// collector. The buyer's stock grows; the collector holds no stock.
func (s *Service) CollectorSale(
	ctx context.Context,
	user auth.User,
	in CollectionInput,
) (string, error) {
	buyerID, err := s.collectionBuyer(user, in.BusinessID)
	if err != nil {
		return "", err
	}

	if err := CheckItems(in.Items); err != nil {
		return "", err
	}

	if in.CollectionDay != nil {
		if err := parseDay(*in.CollectionDay); err != nil {
			return "", err
		}
	}

	var id string

	err = s.db.InTx(ctx, func(ctx context.Context) error {
		id, err = s.collect(ctx, buyerID, in)

		return err
	})

	return id, err
}

// collectionBuyer decides which business buys: a business buys for itself;
// admin and staff pick one; nobody else may.
func (s *Service) collectionBuyer(user auth.User, businessID string) (string, error) {
	if auth.HasRole(user, auth.RoleBusiness) {
		return user.ID, nil
	}

	if !auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff) {
		return "", apperr.Forbidden("You are not allowed to create collections.")
	}

	if businessID == "" {
		return "", apperr.Field("business_id", "Select the business for this collection.")
	}

	return businessID, nil
}

func (s *Service) collect(ctx context.Context, buyerID string, in CollectionInput) (string, error) {
	active, err := s.store.ActiveBusiness(ctx, buyerID)
	if err != nil {
		return "", err
	}

	if !active {
		return "", errBuyerInvalid
	}

	exists, err := s.store.CollectorExists(ctx, in.CollectorID)
	if err != nil {
		return "", err
	}

	if !exists {
		return "", apperr.NotFound("The collector was not found.")
	}

	id := database.NewID()

	err = s.store.Insert(ctx, store.NewTransaction{
		ID: id, SellerID: in.CollectorID, BuyerID: buyerID, Type: "c2b",
		CollectionDay: in.CollectionDay, CollectionDate: in.CollectionDate,
	})
	if err != nil {
		return "", err
	}

	if err := s.store.SnapshotCollector(ctx, id, in.CollectorID); err != nil {
		return "", err
	}

	for position, item := range in.Items {
		if _, found, err := s.store.MaterialPrice(ctx, item.MaterialID); err != nil {
			return "", err
		} else if !found {
			return "", errNoMaterial
		}

		err := s.store.Give(ctx, buyerID, item.MaterialID, item.Weight, item.Price, database.NewID())
		if err != nil {
			return "", err
		}

		err = s.store.InsertItem(ctx, id, position, item.MaterialID, item.Weight, item.Price)
		if err != nil {
			return "", err
		}
	}

	if err := s.store.SetTotal(ctx, id); err != nil {
		return "", err
	}

	s.QueueInvoice(ctx, id, true)

	return id, nil
}
