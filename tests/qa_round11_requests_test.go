package tests

import (
	"slices"
	"testing"
)

func TestQARound11RequestedHoldsAfterWithdrawAndExpiry(t *testing.T) {
	for _, action := range []string{"withdraw", "expiry"} {
		for _, stockGone := range []bool{false, true} {
			name := action + "/available"
			if stockGone {
				name = action + "/stock_gone"
			}

			t.Run(name, func(t *testing.T) {
				w := newTradeWorld(t)
				material := tradeMaterial(t, w.app, "Metal", "5")
				stock := tradeStock(t, w.app, w.seller.id, material, "100", "8")
				materials := []string{w.material, material}
				slices.Sort(materials)
				stockByMaterial := map[string]string{w.material: w.stock, material: stock}

				// Reverse the input order to exercise restoration's material ordering.
				result := status(t, w.buyer.c.Do("POST", "/api/requests", map[string]any{
					"seller_id": w.seller.id,
					"items": []map[string]any{
						{"stock_id": stockByMaterial[materials[1]], "weight": "12.5"},
						{"stock_id": stockByMaterial[materials[0]], "weight": "12.5"},
					},
				}), 200)
				id := result.Body["id"].(string)
				path := "/api/requests/" + id
				status(t, w.seller.c.Do("POST", path+"/offer", map[string]any{
					"items": []map[string]any{
						tradeLine(materials[1], "5", "9"),
						tradeLine(materials[0], "5", "9"),
					},
				}), 200)

				if stockGone {
					// The last material fails after the first regained its requested hold.
					tradeSale(t, w.seller, w.buyer, materials[1], "90", "9")
				}

				if action == "withdraw" {
					status(t, w.seller.c.Do("POST", path+"/withdraw", nil), 200)
				} else {
					marketExpire(t, w, id)
				}

				request := status(t, w.buyer.c.Do("GET", path, nil), 200)
				if request.Body["status"] != "pending" {
					t.Fatalf("request did not return to pending: %s", request.Raw)
				}

				count := tradeText(t, w.app, `SELECT count(*)::text FROM stock_holds
					WHERE request_id=$1 AND status='active'`, id)
				want := "2"
				if stockGone || action == "expiry" {
					want = "0"
				}
				if count != want {
					t.Fatalf("active request holds: %s, want %s", count, want)
				}

				for _, stockID := range []string{w.stock, stock} {
					listing := status(t, w.buyer.c.Do("GET", "/api/market/listings/"+stockID, nil), 200)
					if stockGone || action == "expiry" {
						holdDecimal(t, listing.Body["held_weight"], "0")
						if !stockGone {
							holdDecimal(t, listing.Body["weight"], "100")
						}

						continue
					}

					holdDecimal(t, listing.Body["held_weight"], "12.5")
					holdDecimal(t, listing.Body["weight"], "87.5")
				}
			})
		}
	}
}

func TestQARound11UnansweredRequestHoldExpires(t *testing.T) {
	w := newTradeWorld(t)
	id := marketRequest(t, w, "12.5")
	holdCount(t, w, "active", "1")

	marketExpire(t, w, id)
	holdCount(t, w, "active", "0")
	holdCount(t, w, "released", "1")

	request := status(t, w.buyer.c.Do("GET", "/api/requests/"+id, nil), 200)
	if request.Body["status"] != "pending" {
		t.Fatalf("unanswered request did not stay pending: %s", request.Raw)
	}

	listing := status(t, w.buyer.c.Do("GET", "/api/market/listings/"+w.stock, nil), 200)
	holdDecimal(t, listing.Body["held_weight"], "0")
	holdDecimal(t, listing.Body["weight"], "100")
}

func TestQARound11TradeCompleteNotice(t *testing.T) {
	for _, maker := range []string{"seller", "buyer"} {
		t.Run(maker, func(t *testing.T) {
			w := newTradeWorld(t)
			id := marketRequest(t, w, "12.5")
			tradeOffer(t, w.seller, id, w.material, "10", "9")
			author, recipient := w.seller, w.buyer
			if maker == "buyer" {
				tradeOffer(t, w.buyer, id, w.material, "11", "9")
				author, recipient = w.buyer, w.seller
			}

			path := "/api/requests/" + id + "/accept"
			status(t, recipient.c.Do("POST", path, nil), 200)
			status(t, author.c.Do("POST", path, nil), 200)

			page := status(t, recipient.c.Do("GET", "/api/notifications", nil), 200)
			found := 0
			for _, value := range tradeItems(page) {
				note := value.(map[string]any)
				if note["link"] != "/market/"+id {
					continue
				}

				found++
				if note["title"] != "Trade complete" || note["body"] != "Your trade for Glass is complete." {
					t.Fatalf("completion notice: %+v", note)
				}
			}

			if found != 1 {
				t.Fatalf("completion notices: %d, want 1", found)
			}
		})
	}
}
