package tests

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"
	"testing"

	marketsvc "github.com/connor-davis/3reco/internal/services/market"
	"github.com/connor-davis/3reco/internal/services/notifications"
	marketstore "github.com/connor-davis/3reco/internal/stores/market"
	notesstore "github.com/connor-davis/3reco/internal/stores/notifications"
	"github.com/connor-davis/3reco/tests/testutil"
)

func cartLine(stock, material, weight string) map[string]any {
	return map[string]any{"stock_id": stock, "material_id": material, "weight": weight}
}

func cartPath(seller tradeUser) string { return "/api/cart?seller_id=" + seller.id }

func cartPut(buyer tradeUser, seller tradeUser, lines ...map[string]any) testutil.Response {
	return buyer.c.Do("PUT", cartPath(seller), map[string]any{"items": lines})
}

// cartLeft is the message a refused line carries.
func cartLeft(t *testing.T, res testutil.Response) string {
	t.Helper()

	fields, _ := res.Body["fields"].(map[string]any)
	message, _ := fields["items"].(string)

	return message
}

// cartExpire runs the expiry worker once, as the server does every 3 minutes.
func cartExpire(t *testing.T, w tradeWorld) {
	t.Helper()

	notes := notifications.New(notesstore.New(w.app.DB))
	service := marketsvc.New(w.app.DB, marketstore.New(w.app.DB), nil, notes)
	if err := service.ExpireCartHolds(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func cartForceExpiry(t *testing.T, w tradeWorld, stock string) {
	t.Helper()

	tradeExec(t, w.app, `UPDATE stock_holds SET expires_at=clock_timestamp()-interval '1 second'
		WHERE cart_id IS NOT NULL AND stock_id=$1 AND status='active'`, stock)
}

func cartAvailable(t *testing.T, viewer tradeUser, stock string) any {
	t.Helper()

	return status(t, viewer.c.Do("GET", "/api/market/listings/"+stock, nil), 200).Body["weight"]
}

func cartNotes(t *testing.T, w tradeWorld, user tradeUser) string {
	t.Helper()

	return tradeText(t, w.app,
		`SELECT count(*)::text FROM notifications WHERE user_id=$1 AND type='cart_expired'`, user.id)
}

func TestCartHoldsReserveStockForOthers(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")

	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "60")), 200)
	holdCount(t, w, "active", "1")
	holdDecimal(t, cartAvailable(t, other, w.stock), "40")

	// The hold lasts 48 hours and the cart line says when it ends.
	ttl := tradeText(t, w.app, `SELECT (expires_at-created_at BETWEEN
		interval '47 hours 59 minutes' AND interval '48 hours 1 minute')::text
		FROM stock_holds WHERE cart_id IS NOT NULL`)
	if ttl != "true" {
		t.Fatalf("cart hold lifetime: %s", ttl)
	}

	cart := status(t, w.buyer.c.Do("GET", cartPath(w.seller), nil), 200)
	line := tradeItems(cart)[0].(map[string]any)
	if until, _ := line["reserved_until"].(string); until == "" {
		t.Fatalf("cart line lacks reserved_until: %s", cart.Raw)
	}

	refused := status(t, cartPut(other, w.seller, cartLine(w.stock, w.material, "41")), 400)
	if got := cartLeft(t, refused); got != "Only 40 kg left." {
		t.Fatalf("refusal %q", got)
	}

	status(t, cartPut(other, w.seller, cartLine(w.stock, w.material, "40")), 200)
	holdDecimal(t, cartAvailable(t, w.buyer, w.stock), "0")

	third := tradeNewUser(t, w.app, "business")
	if got := cartLeft(t, status(t, cartPut(third, w.seller, cartLine(w.stock, w.material, "1")), 400)); got != "None left." {
		t.Fatalf("full refusal %q", got)
	}
}

func TestCartHoldsOwnLineCanChange(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")

	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "60")), 200)
	first := tradeText(t, w.app, `SELECT expires_at::text FROM stock_holds WHERE cart_id IS NOT NULL`)

	// Raising up to free stock plus the buyer's own hold, then lowering.
	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "100")), 200)
	holdDecimal(t, cartAvailable(t, other, w.stock), "0")
	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "100.01")), 400)

	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "10")), 200)
	holdDecimal(t, cartAvailable(t, other, w.stock), "90")
	holdCount(t, w, "active", "1")

	// Editing never extends the original 48 hours.
	if got := tradeText(t, w.app, `SELECT expires_at::text FROM stock_holds WHERE cart_id IS NOT NULL`); got != first {
		t.Fatalf("edit moved the hold end from %s to %s", first, got)
	}

	// A line added again after its old hold ended gets a fresh 48 hours.
	cartForceExpiry(t, w, w.stock)
	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "10")), 200)
	fresh := tradeText(t, w.app, `SELECT (expires_at>now()+interval '47 hours')::text
		FROM stock_holds WHERE cart_id IS NOT NULL AND status='active'`)
	if fresh != "true" {
		t.Fatalf("re-added line did not get a fresh hold: %s", fresh)
	}
}

func TestCartHoldsFreedByRemoveAndClear(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	metal := tradeMaterial(t, w.app, "Metal", "5")
	metalStock := tradeStock(t, w.app, w.seller.id, metal, "50", "8")

	status(t, cartPut(w.buyer, w.seller,
		cartLine(w.stock, w.material, "30"), cartLine(metalStock, metal, "20")), 200)
	holdCount(t, w, "active", "2")

	// Dropping one line frees only that line's stock.
	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "30")), 200)
	holdCount(t, w, "active", "1")
	holdDecimal(t, cartAvailable(t, other, metalStock), "50")
	holdDecimal(t, cartAvailable(t, other, w.stock), "70")

	status(t, w.buyer.c.Do("DELETE", cartPath(w.seller), nil), 200)
	holdCount(t, w, "active", "0")
	holdDecimal(t, cartAvailable(t, other, w.stock), "100")

	// An empty PUT clears too.
	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "30")), 200)
	status(t, cartPut(w.buyer, w.seller), 200)
	holdCount(t, w, "active", "0")
}

func TestCartHoldsMoveToTheRequestWithoutAGap(t *testing.T) {
	w := newTradeWorld(t)
	third := tradeNewUser(t, w.app, "business")
	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "100")), 200)
	status(t, cartPut(third, w.seller, cartLine(w.stock, w.material, "1")), 400)

	// A third buyer keeps trying for a kilo while the cart becomes a request.
	stop := make(chan struct{})
	done := make(chan struct{})
	var leaked atomic.Int32

	go func() {
		defer close(done)

		for {
			select {
			case <-stop:
				return
			default:
			}

			if cartPut(third, w.seller, cartLine(w.stock, w.material, "1")).Status == 200 {
				leaked.Add(1)
			}
		}
	}()

	res := w.buyer.c.Do("POST", "/api/requests", map[string]any{
		"seller_id": w.seller.id, "from_cart": true,
		"items": []map[string]any{{"stock_id": w.stock, "material_id": w.material, "weight": "100"}},
	})
	close(stop)
	<-done
	status(t, res, 200)

	if leaked.Load() != 0 {
		t.Fatalf("stock was free for the third buyer %d times", leaked.Load())
	}

	// The cart hold is gone, the request holds the stock, and the cart is deleted.
	holdCount(t, w, "active", "1")
	if got := tradeText(t, w.app, `SELECT (request_id IS NOT NULL AND cart_id IS NULL)::text
		FROM stock_holds WHERE status='active'`); got != "true" {
		t.Fatalf("active hold is not the request's: %s", got)
	}

	if got := tradeText(t, w.app, `SELECT count(*)::text FROM carts`); got != "0" {
		t.Fatalf("cart remains after the request: %s", got)
	}

	status(t, cartPut(third, w.seller, cartLine(w.stock, w.material, "1")), 400)
}

func TestCartHoldsExpireOnce(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	metal := tradeMaterial(t, w.app, "Metal", "5")
	metalStock := tradeStock(t, w.app, w.seller.id, metal, "50", "8")
	status(t, cartPut(w.buyer, w.seller,
		cartLine(w.stock, w.material, "30"), cartLine(metalStock, metal, "20")), 200)
	status(t, cartPut(other, w.seller, cartLine(w.stock, w.material, "10")), 200)

	// Nothing has ended yet: the worker changes nothing.
	cartExpire(t, w)
	holdCount(t, w, "active", "3")

	// One line of two ends: it leaves the cart and frees its stock; the other stays.
	cartForceExpiry(t, w, w.stock)
	tradeExec(t, w.app, `UPDATE stock_holds SET expires_at=clock_timestamp()-interval '1 second'
		WHERE stock_id=$1 AND buyer_id=$2 AND status='active'`, w.stock, other.id)
	cartExpire(t, w)

	if items := tradeItems(status(t, w.buyer.c.Do("GET", cartPath(w.seller), nil), 200)); len(items) != 1 {
		t.Fatalf("cart after one line expired: %+v", items)
	}

	holdDecimal(t, cartAvailable(t, other, w.stock), "100")
	holdDecimal(t, cartAvailable(t, other, metalStock), "30")

	body := tradeText(t, w.app, `SELECT body FROM notifications WHERE user_id=$1 AND type='cart_expired'`,
		w.buyer.id)
	if !strings.Contains(body, "Glass") || strings.Contains(body, "Metal") ||
		!strings.Contains(body, "Biz ") || !strings.Contains(body, "removed from your cart") {
		t.Fatalf("notice: %q", body)
	}

	// Running again finds nothing new, and the other buyer is told about their own cart only.
	cartExpire(t, w)

	if got := cartNotes(t, w, w.buyer); got != "1" {
		t.Fatalf("buyer notices %s, want 1", got)
	}

	if got := cartNotes(t, w, other); got != "1" {
		t.Fatalf("other buyer notices %s, want 1", got)
	}

	if got := cartNotes(t, w, w.seller); got != "0" {
		t.Fatalf("seller heard of a buyer's cart: %s", got)
	}

	// The last line ends: the empty cart goes with it.
	cartForceExpiry(t, w, metalStock)
	cartExpire(t, w)

	if got := tradeText(t, w.app, `SELECT count(*)::text FROM carts WHERE buyer_id=$1`, w.buyer.id); got != "0" {
		t.Fatalf("empty cart remains: %s", got)
	}

	if got := cartNotes(t, w, w.buyer); got != "2" {
		t.Fatalf("buyer notices %s, want 2", got)
	}

	holdCount(t, w, "active", "0")
}

func TestCartHoldsRaceForTheLastKilo(t *testing.T) {
	for round := range 8 {
		w := newTradeWorld(t)
		material := tradeMaterial(t, w.app, fmt.Sprintf("Race %d", round), "5")
		stock := tradeStock(t, w.app, w.seller.id, material, "1", "8")
		rival := tradeNewUser(t, w.app, "business")

		start := make(chan struct{})
		results := make(chan testutil.Response, 2)

		for _, buyer := range []tradeUser{w.buyer, rival} {
			go func() {
				<-start
				results <- cartPut(buyer, w.seller, cartLine(stock, material, "1"))
			}()
		}

		close(start)

		counts := map[int]int{}
		for range 2 {
			counts[(<-results).Status]++
		}

		if counts[200] != 1 || counts[400] != 1 {
			t.Fatalf("round %d statuses: %v", round, counts)
		}

		got := tradeText(t, w.app, `SELECT sum(weight)::text FROM stock_holds
			WHERE stock_id=$1 AND status='active'`, stock)
		holdDecimal(t, got, "1")
	}
}

func TestCartHoldsRaceAgainstARequest(t *testing.T) {
	for round := range 5 {
		w := newTradeWorld(t)
		material := tradeMaterial(t, w.app, fmt.Sprintf("Direct %d", round), "5")
		stock := tradeStock(t, w.app, w.seller.id, material, "1", "8")
		rival := tradeNewUser(t, w.app, "business")

		start := make(chan struct{})
		results := make(chan testutil.Response, 2)

		go func() {
			<-start
			results <- cartPut(w.buyer, w.seller, cartLine(stock, material, "1"))
		}()

		go func() {
			<-start
			results <- rival.c.Do("POST", "/api/requests", map[string]any{
				"seller_id": w.seller.id,
				"items":     []map[string]any{{"stock_id": stock, "weight": "1"}},
			})
		}()

		close(start)

		wins := 0
		for range 2 {
			result := <-results
			if result.Status == 200 {
				wins++
			} else if result.Status != 400 && result.Status != 409 {
				t.Fatalf("round %d: unexpected %d %s", round, result.Status, result.Raw)
			}
		}

		if wins != 1 {
			t.Fatalf("round %d: %d winners for the last kilo", round, wins)
		}

		got := tradeText(t, w.app, `SELECT sum(weight)::text FROM stock_holds
			WHERE stock_id=$1 AND status='active'`, stock)
		holdDecimal(t, got, "1")
	}
}

func TestCartHoldsBelongToTheirBuyer(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "60")), 200)

	// Another user sees no line or end time, and cannot clear or edit the hold.
	forged := cartPath(w.seller) + "&buyer_id=" + w.buyer.id
	if items := tradeItems(status(t, other.c.Do("GET", forged, nil), 200)); len(items) != 0 {
		t.Fatalf("another buyer reads the cart: %+v", items)
	}

	status(t, other.c.Do("DELETE", forged, nil), 200)
	status(t, other.c.Do("PUT", forged, map[string]any{
		"items": []map[string]any{cartLine(w.stock, w.material, "5")},
	}), 200)

	holdDecimal(t, tradeText(t, w.app, `SELECT weight::text FROM stock_holds
		WHERE buyer_id=$1 AND status='active'`, w.buyer.id), "60")
	holdCount(t, w, "active", "2")

	// The seller never reads or clears a buyer's cart either.
	status(t, w.seller.c.Do("DELETE", cartPath(w.seller), nil), 400)
	holdDecimal(t, tradeText(t, w.app, `SELECT weight::text FROM stock_holds
		WHERE buyer_id=$1 AND status='active'`, w.buyer.id), "60")
}

func TestCartHoldsBlockStockEdits(t *testing.T) {
	w := newTradeWorld(t)
	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "60")), 200)
	path := "/api/stock/" + w.stock

	// Cart holds are rows of the same table as offer holds, so the same rule applies.
	status(t, w.seller.c.Do("PATCH", path, map[string]any{"weight": "50"}), 409)
	status(t, w.seller.c.Do("DELETE", path, nil), 409)
	status(t, w.seller.c.Do("PATCH", path, map[string]any{"weight": "60"}), 200)

	status(t, w.buyer.c.Do("DELETE", cartPath(w.seller), nil), 200)
	status(t, w.seller.c.Do("PATCH", path, map[string]any{"weight": "50"}), 200)
	status(t, w.seller.c.Do("DELETE", path, nil), 200)
}

func TestCartHoldsAreLive(t *testing.T) {
	w := newTradeWorld(t)
	other := tradeNewUser(t, w.app, "business")
	socks := joinLive(t, w.app, w.buyer, w.seller, other)

	status(t, cartPut(w.buyer, w.seller, cartLine(w.stock, w.material, "5")), 200)
	cartID := tradeText(t, w.app, `SELECT id FROM carts WHERE buyer_id=$1`, w.buyer.id)

	socks[0].hear("cart", cartID)
	socks[1].hear("stock", w.stock)
	socks[2].hear("listing", w.stock)
}
