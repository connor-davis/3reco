package importer

import (
	"fmt"
	"strings"

	"github.com/connor-davis/3reco/internal/services/profile"
)

var notificationTypes = []string{
	"request_received", "request_accepted", "request_rejected", "request_cancelled",
	"message_received", "stock_listed", "stock_unlisted",
}

// planCollectors maps collectors. Convex has no link from a collector to a
// login: Go joins them by normalized_phone, so only the phone is copied.
func (p *planner) planCollectors() {
	fields := []field{
		{col: "name", key: "name", kind: kText, required: true},
		{col: "email", key: "email", kind: kText},
		{col: "phone", key: "phone", kind: kText},
		{col: "normalized_phone", key: "normalizedPhone", kind: kText},
		{col: "image", key: "image", kind: kText},
		{col: "bank_account_holder_name", key: "bankAccountHolderName", kind: kText},
		{col: "bank_name", key: "bankName", kind: kText},
		{col: "bank_account_number", key: "bankAccountNumber", kind: kText},
		{col: "bank_branch_code", key: "bankBranchCode", kind: kText},
		{col: "bank_account_type", key: "bankAccountType", kind: kText, oneOf: accountTypes},
		{col: "payout_method", key: "payoutMethod", kind: kText, oneOf: []string{"bank", "ewallet"}},
		{col: "ewallet_platform_name", key: "ewalletPlatformName", kind: kText},
		{col: "ewallet_payment_id", key: "ewalletPaymentId", kind: kText},
		{col: "street_address", key: "streetAddress", kind: kText},
		{col: "city", key: "city", kind: kText},
		{col: "area_code", key: "areaCode", kind: kInt},
		{col: "province", key: "province", kind: kText, oneOf: provinces},
		{col: "created_by_user_id", key: "createdByUserId", kind: kRef, required: true, refs: p.users},
		{col: "created_by_business_id", key: "createdByBusinessId", kind: kRef, refs: p.users},
	}

	seenPhone := map[string]string{}

	for _, d := range p.docs["collectors"] {
		r := newRow(p.rep, "collectors", d)
		out := r.build(fields)
		phone, _ := out["phone"].(string)
		email, _ := out["email"].(string)
		if strings.TrimSpace(phone) == "" {
			delete(out, "phone")
			delete(out, "normalized_phone")
			if strings.TrimSpace(email) == "" {
				r.fail("phone", "Add an email or a phone number.")
			}
		} else if normalized, err := profile.Phone(phone); err != nil {
			r.fail("phone", err.Error())
		} else {
			out["phone"], out["normalized_phone"] = normalized, normalized
		}

		p.seal(r, out, "bank_account_number", "ewallet_payment_id")
		r.created(out, true)

		if phone, ok := out["normalized_phone"].(string); ok {
			if other, dup := seenPhone[phone]; dup {
				r.fail("normalizedPhone", "same phone as collector "+other)
			}

			seenPhone[phone] = r.id
		}

		p.rows["collectors"] = append(p.rows["collectors"], out)
	}
}

// planMaterials maps the material catalog. carbonFactor is text in Convex.
func (p *planner) planMaterials() {
	fields := []field{
		{col: "name", key: "name", kind: kText, required: true},
		{col: "carbon_factor", key: "carbonFactor", kind: kNumString, required: true},
		{col: "gw_code", key: "gwCode", kind: kText, required: true},
		{col: "price", key: "price", kind: kNum, required: true, nonNeg: true},
	}

	for _, d := range p.docs["materials"] {
		r := newRow(p.rep, "materials", d)
		out := r.build(fields)
		r.created(out, true)
		p.rows["materials"] = append(p.rows["materials"], out)
	}
}

// planStock maps listed and unlisted stock.
func (p *planner) planStock() {
	fields := []field{
		{col: "owner_id", key: "ownerId", kind: kRef, required: true, refs: p.users},
		{col: "material_id", key: "materialId", kind: kRef, required: true, refs: p.materials},
		{col: "weight", key: "weight", kind: kNum, required: true, nonNeg: true},
		{col: "price", key: "price", kind: kNum, required: true, nonNeg: true},
		{col: "is_listed", key: "isListed", kind: kBool},
	}

	for _, d := range p.docs["stock"] {
		r := newRow(p.rep, "stock", d)
		out := r.build(fields)
		r.created(out, true)
		p.rows["stock"] = append(p.rows["stock"], out)
	}
}

// planNotifications maps notifications as they are.
func (p *planner) planNotifications() {
	fields := []field{
		{col: "user_id", key: "userId", kind: kRef, required: true, refs: p.users},
		{col: "type", key: "type", kind: kText, required: true, oneOf: notificationTypes},
		{col: "title", key: "title", kind: kText, required: true},
		{col: "body", key: "body", kind: kText, required: true},
		{col: "link", key: "link", kind: kText},
		{col: "read", key: "read", kind: kBool},
		{col: "dismissed", key: "dismissed", kind: kBool},
	}

	for _, d := range p.docs["notifications"] {
		r := newRow(p.rep, "notifications", d)
		out := r.build(fields)
		r.created(out, false)
		p.rows["notifications"] = append(p.rows["notifications"], out)
	}
}

// planCarts maps carts and their items. An item whose stock is gone is
// dropped, as the database would have done when the stock was deleted.
func (p *planner) planCarts() {
	fields := []field{
		{col: "buyer_id", key: "buyerId", kind: kRef, required: true, refs: p.users},
		{col: "seller_id", key: "sellerId", kind: kRef, required: true, refs: p.users},
	}
	itemFields := []field{
		{col: "stock_id", key: "stockId", kind: kRef, required: true, refs: p.stock},
		{col: "material_id", key: "materialId", kind: kRef, required: true, refs: p.materials},
	}

	seenPair := map[string]string{}

	for _, d := range p.docs["carts"] {
		r := newRow(p.rep, "carts", d)
		out := r.build(fields)
		r.created(out, true)

		pair := fmt.Sprint(out["buyer_id"], "|", out["seller_id"])
		if other, dup := seenPair[pair]; dup {
			r.fail("buyerId", "second cart for the same buyer and seller (also "+other+")")
		}

		seenPair[pair] = r.id

		p.rows["carts"] = append(p.rows["carts"], out)
		p.cartItems(r, itemFields)
	}
}

func (p *planner) cartItems(r *row, fields []field) {
	seenStock := map[string]bool{}

	for i, item := range r.list("items") {
		if !p.stock[str(item["stockId"])] {
			p.rep.note("cart items dropped (the stock is gone)")

			continue
		}

		child := r.child("cart_items", "items", i, item)
		out := without(child.build(fields))
		out["cart_id"] = r.id

		if seenStock[str(item["stockId"])] {
			p.rep.note("cart items dropped (the same stock twice in one cart)")

			continue
		}

		seenStock[str(item["stockId"])] = true
		p.rows["cart_items"] = append(p.rows["cart_items"], out)
	}
}

// planReviews maps store reviews. One review per transaction, as the database says.
func (p *planner) planReviews() {
	fields := []field{
		{col: "seller_id", key: "sellerId", kind: kRef, required: true, refs: p.users},
		{col: "buyer_id", key: "buyerId", kind: kRef, required: true, refs: p.users},
		{col: "transaction_id", key: "transactionId", kind: kRef, required: true, refs: p.transactions},
		{col: "rating", key: "rating", kind: kInt, required: true},
		{col: "comment", key: "comment", kind: kText},
	}

	seen := map[string]string{}

	for _, d := range p.docs["storeReviews"] {
		r := newRow(p.rep, "storeReviews", d)
		out := r.build(fields)
		r.created(out, false)

		if rating, ok := out["rating"].(int32); ok && (rating < 1 || rating > 5) {
			r.fail("rating", "must be 1 to 5")
		}

		if tx, ok := out["transaction_id"].(string); ok {
			if other, dup := seen[tx]; dup {
				r.fail("transactionId", "second review for the same transaction (also "+other+")")
			}

			seen[tx] = r.id
		}

		p.rows["store_reviews"] = append(p.rows["store_reviews"], out)
	}
}
