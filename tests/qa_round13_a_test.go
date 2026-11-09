package tests

import (
	"context"
	"fmt"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
	transactionstore "github.com/connor-davis/3reco/internal/stores/transactions"
)

func TestRound13CollectorRemovesOwnSaleReceipt(t *testing.T) {
	w := newTradeWorld(t)
	mine := tradeNewUser(t, w.app, "collector")
	unlinked := tradeNewUser(t, w.app, "collector")
	other := tradeNewUser(t, w.app, "collector")
	stranger := tradeNewUser(t, w.app, "business")

	staff := tradeNewUser(t, w.app, "staff")
	admin := tradeNewUser(t, w.app, "admin")
	collector := tradeCollector(t, w.app, w.buyer, mine.phone)
	otherCollector := tradeCollector(t, w.app, w.buyer, other.phone)

	result := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "12.5", "8"))), 200)
	id := result.Body["transaction_id"].(string)
	path := "/api/transactions/" + id
	receipt := status(t, uploadImage(t, w.app, w.buyer.c, path+"/receipts", receiptImage(1)), 200)
	remove := path + "/receipts/" + receipt.Body["id"].(string)

	for _, caller := range []tradeUser{mine, w.buyer, admin} {
		detail := status(t, caller.c.Do("GET", path, nil), 200)
		if detail.Body["can_remove_receipts"] != true {
			t.Fatalf("party permission: %s", detail.Raw)
		}
	}

	for _, caller := range []tradeUser{unlinked, other, stranger, w.seller, staff} {
		// Check the shared permission even for callers whose detail stays hidden.
		role := tradeText(t, w.app, `SELECT role FROM users WHERE id=$1`, caller.id)
		allowed, err := w.app.Trades.CanRemoveReceipts(context.Background(),
			auth.User{ID: caller.id, Role: &role},
			transactionstore.Transaction{
				Type: "c2b", Seller: database.Party{ID: collector}, Buyer: database.Party{ID: w.buyer.id},
			})
		if err != nil || allowed {
			t.Fatalf("stranger permission: %v, %v", allowed, err)
		}

		want := 404
		if caller.id == staff.id {
			want = 403
			detail := status(t, caller.c.Do("GET", path, nil), 200)
			if detail.Body["can_remove_receipts"] != false {
				t.Fatalf("staff permission: %s", detail.Raw)
			}
		} else {
			status(t, caller.c.Do("GET", path, nil), 404)
		}
		status(t, caller.c.Do("DELETE", remove, nil), want)
	}

	// The collector may remove, but may still neither upload nor use another sale.
	status(t, uploadImage(t, w.app, mine.c, path+"/receipts", receiptImage(2)), 404)
	otherSale := status(t, w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(otherCollector, "", tradeLine(w.material, "1", "8"))), 200)
	otherPath := "/api/transactions/" + otherSale.Body["transaction_id"].(string) + "/receipts"
	otherReceipt := status(t, uploadImage(t, w.app, w.buyer.c, otherPath, receiptImage(3)), 200)
	status(t, mine.c.Do("DELETE", otherPath+"/"+otherReceipt.Body["id"].(string), nil), 404)

	rows := tradeItems(status(t, mine.c.Do("GET", "/api/transactions/sales", nil), 200))
	if len(rows) != 1 || rows[0].(map[string]any)["can_remove_receipts"] != true {
		t.Fatalf("collector list permission: %v", rows)
	}
	status(t, mine.c.Do("DELETE", remove, nil), 200)
	status(t, w.buyer.c.Do("GET", remove, nil), 404)
}

func TestRound13RequestFromCartRefusesChangedCart(t *testing.T) {
	w := newTradeWorld(t)
	material := tradeMaterial(t, w.app, "Metal", "5")
	stock := tradeStock(t, w.app, w.seller.id, material, "100", "8")
	first := map[string]any{"stock_id": w.stock, "material_id": w.material, "weight": "12.5"}
	second := map[string]any{"stock_id": stock, "material_id": material, "weight": "5"}
	path := "/api/cart?seller_id=" + w.seller.id
	status(t, w.buyer.c.Do("PUT", path, map[string]any{"items": []any{first, second}}), 200)
	status(t, w.buyer.c.Do("PUT", path, map[string]any{"items": []any{first}}), 200)

	for _, caller := range []tradeUser{w.buyer, tradeNewUser(t, w.app, "business")} {
		items := []any{first, second}
		if caller.id != w.buyer.id {
			items = []any{first}
		}
		result := status(t, caller.c.Do("POST", "/api/requests", map[string]any{
			"seller_id": w.seller.id, "from_cart": true, "buyer_id": w.buyer.id, "items": items,
		}), 409)
		if result.Body["message"] != "Your cart changed. Check it and send again." {
			t.Fatalf("changed cart: %s", result.Raw)
		}
	}

	if count := tradeText(t, w.app, `SELECT count(*)::text FROM transaction_requests`); count != "0" {
		t.Fatalf("refused creates wrote %s requests", count)
	}
	holdCount(t, w, "active", "0")
	holdDecimal(t, tradeStockWeight(t, w.app, w.seller.id, w.material), "100")

	// Missing cart materials are refused too; weights may be changed independently.
	status(t, w.buyer.c.Do("PUT", path, map[string]any{"items": []any{first, second}}), 200)
	status(t, w.buyer.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.seller.id, "from_cart": true, "items": []any{first},
	}), 409)
	status(t, w.buyer.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.seller.id, "from_cart": true, "items": []any{},
	}), 409)
	first["weight"] = "9.75"
	result := status(t, w.buyer.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.seller.id, "from_cart": true, "items": []any{second, first},
	}), 200)
	id := result.Body["id"].(string)
	holdDecimal(t, tradeText(t, w.app, `SELECT requested_weight::text
		FROM transaction_request_items WHERE request_id=$1 AND material_id=$2`, id, w.material), "9.75")
}

func TestRound13CartRemovalIsLive(t *testing.T) {
	w := newTradeWorld(t)
	path := "/api/cart?seller_id=" + w.seller.id
	status(t, w.buyer.c.Do("PUT", path, map[string]any{"items": []any{
		map[string]any{"stock_id": w.stock, "material_id": w.material, "weight": "12.5"},
	}}), 200)
	id := tradeText(t, w.app, `SELECT id FROM carts WHERE buyer_id=$1`, w.buyer.id)
	socks := joinLive(t, w.app, w.buyer, w.seller)
	status(t, w.buyer.c.Do("PUT", path, map[string]any{"items": []any{}}), 200)
	socks[0].hear("cart", id)
	socks[1].quiet("seller cannot hear a buyer's cart")
}

func TestRound13TradeCompleteNoticeHasTerms(t *testing.T) {
	for _, count := range []int{1, 3} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			w := newTradeWorld(t)
			items := []map[string]any{{"stock_id": w.stock, "weight": "15"}}
			lines := []map[string]any{tradeLine(w.material, "12.5", "22")}
			for i := 1; i < count; i++ {
				material := tradeMaterial(t, w.app, fmt.Sprintf("Metal %d", i), "5")
				stock := tradeStock(t, w.app, w.seller.id, material, "100", "8")
				items = append(items, map[string]any{"stock_id": stock, "weight": "2"})
				lines = append(lines, tradeLine(material, "1", "8"))
			}

			result := status(t, w.buyer.c.Do("POST", "/api/requests", map[string]any{
				"seller_id": w.seller.id, "items": items,
			}), 200)
			id := result.Body["id"].(string)
			tradeOffer(t, w.seller, id, w.material, "10", "9")
			offerPath := "/api/requests/" + id + "/offer"
			status(t, w.buyer.c.Do("POST", offerPath, map[string]any{"items": lines}), 200)
			stranger := tradeNewUser(t, w.app, "business")
			path := "/api/requests/" + id + "/accept"
			status(t, stranger.c.Do("POST", path, nil), 404)
			status(t, w.seller.c.Do("POST", path, nil), 200)
			result = status(t, w.buyer.c.Do("POST", path, nil), 200)
			tradePath := "/api/transactions/" + result.Body["transaction_id"].(string)
			trade := status(t, w.seller.c.Do("GET", tradePath, nil), 200)
			first := tradeItems(trade)[0].(map[string]any)
			name := "12.5 kg Glass"
			// Stored item order determines which material leads the notice.
			if first["material_id"] != w.material {
				name = "1 kg " + first["material_name"].(string)
			}
			total := "275.00"
			if count == 1 {
				name += " at R 22.00 / kg"
			}
			if count > 1 {
				name += " and 2 more"
				total = "291.00"
			}
			want := "Your trade for " + name + " is complete: R " + total + "."
			body := tradeText(t, w.app, `SELECT body FROM notifications
				WHERE user_id=$1 AND title='Trade complete'`, w.seller.id)
			if body != want {
				t.Fatalf("completion body: %q, want %q", body, want)
			}
			for _, caller := range []tradeUser{w.buyer, stranger} {
				if got := tradeText(t, w.app, `SELECT count(*)::text FROM notifications
					WHERE user_id=$1 AND title='Trade complete'`, caller.id); got != "0" {
					t.Fatalf("nonrecipient got %s completion notices", got)
				}
			}
		})
	}
}
