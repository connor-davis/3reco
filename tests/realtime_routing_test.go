package tests

import (
	"context"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// liveWorld is a trade world plus the people every routing test needs.
type liveWorld struct {
	tradeWorld
	admin, staff, stranger tradeUser
}

func newLiveWorld(t *testing.T) liveWorld {
	t.Helper()

	w := newTradeWorld(t)

	return liveWorld{
		tradeWorld: w,
		admin:      tradeNewUser(t, w.app, "admin"),
		staff:      tradeNewUser(t, w.app, "staff"),
		stranger:   tradeNewUser(t, w.app, "business"),
	}
}

// A notification goes to its owner and nobody else, and the event holds only
// type, kind and id.
func TestLiveNotificationReachesOnlyItsOwner(t *testing.T) {
	w := newLiveWorld(t)
	socks := joinLive(t, w.app, w.seller, w.buyer, w.admin)
	owner, buyer, admin := socks[0], socks[1], socks[2]

	tradeExec(t, w.app, `
		INSERT INTO notifications (id, user_id, type, title, body)
		VALUES ('n1', $1, 'message_received', 'SECRET TITLE', 'SECRET BODY')`, w.seller.id)

	owner.hear("notification", "n1")
	buyer.quiet("another business")
	admin.quiet("admin")
}

// A request row goes to both people, admins and staff, never to a stranger.
func TestLiveRequestRowGoesToPartiesAndStaff(t *testing.T) {
	w := newLiveWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	socks := joinLive(t, w.app, w.buyer, w.seller, w.admin, w.staff, w.stranger)

	tradeExec(t, w.app, `UPDATE transaction_requests SET updated_at = now() WHERE id = $1`, id)

	for _, sock := range socks[:4] {
		sock.hear("request", id)
	}

	socks[4].quiet("stranger")
}

// A chat message goes to the two people and admins. Staff cannot read a chat,
// so they hear nothing, and neither does a stranger.
func TestLiveChatGoesToPartiesAndAdminOnly(t *testing.T) {
	w := newLiveWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	socks := joinLive(t, w.app, w.buyer, w.seller, w.admin, w.staff, w.stranger)

	tradeExec(t, w.app, `
		INSERT INTO transaction_request_messages (id, request_id, sender_id, content)
		VALUES ('m1', $1, $2, 'SECRET WORDS')`, id, w.buyer.id)

	for _, sock := range socks[:3] {
		sock.hear("request", id)
	}

	socks[3].quiet("staff")
	socks[4].quiet("stranger")
}

// A request that moves to a new buyer tells the old buyer and the new one.
func TestLivePartyChangeReachesOldAndNewParty(t *testing.T) {
	w := newLiveWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	socks := joinLive(t, w.app, w.buyer, w.seller, w.stranger)

	tradeExec(t, w.app, `UPDATE transaction_requests SET buyer_id = $2 WHERE id = $1`, id, w.stranger.id)

	for _, sock := range socks {
		sock.hear("request", id)
	}

	// Afterwards the old buyer is no longer a party.
	tradeExec(t, w.app, `UPDATE transaction_requests SET updated_at = now() WHERE id = $1`, id)
	socks[1].hear("request", id)
	socks[2].hear("request", id)
	socks[0].quiet("old buyer")
}

// A business trade goes to buyer, seller, admins and staff; a receipt on it
// is the same kind of event.
func TestLiveBusinessTransactionRouting(t *testing.T) {
	w := newLiveWorld(t)
	id := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")
	socks := joinLive(t, w.app, w.buyer, w.seller, w.admin, w.staff, w.stranger)

	tradeExec(t, w.app, `UPDATE transactions SET invoice_key = 'k' WHERE id = $1`, id)

	for _, sock := range socks[:4] {
		sock.hear("transaction", id)
	}

	socks[4].quiet("stranger")

	tradeExec(t, w.app, `
		INSERT INTO transaction_receipts
			(id, transaction_id, object_key, file_name, content_type, size, uploaded_by)
		VALUES ('r1', $1, 'k', 'r.png', 'image/png', 10, $2)`, id, w.buyer.id)

	for _, sock := range socks[:4] {
		sock.hear("transaction", id)
	}

	socks[4].quiet("stranger")
}

// A collector sale stores the collector's id as seller, yet the collector's
// sign-in user, the business buyer, admins and staff all hear it.
func TestLiveCollectorSaleRouting(t *testing.T) {
	w := newLiveWorld(t)
	mine := tradeNewUser(t, w.app, "collector")
	other := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, mine.phone)

	res := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "10", "6")))
	tradeWant(t, "collection", res, 200)

	id := res.Body["transaction_id"].(string)
	socks := joinLive(t, w.app, w.buyer, mine, w.admin, w.staff, other, w.stranger, w.seller)

	tradeExec(t, w.app, `UPDATE transactions SET invoice_key = 'k' WHERE id = $1`, id)

	for _, sock := range socks[:4] {
		sock.hear("transaction", id)
	}

	socks[4].quiet("another collector")
	socks[5].quiet("stranger")
	socks[6].quiet("another business")
}

// Stock goes to its owner; a listed row also tells every signed-in user.
func TestLiveStockAndListingRouting(t *testing.T) {
	w := newLiveWorld(t)
	socks := joinLive(t, w.app, w.seller, w.buyer, w.admin)
	owner, buyer, admin := socks[0], socks[1], socks[2]

	tradeExec(t, w.app, `
		INSERT INTO stock (id, owner_id, material_id, weight, price, is_listed)
		VALUES ('s-private', $1, $2, 5, 3, false)`, w.seller.id, w.material)

	owner.hear("stock", "s-private")
	buyer.quiet("buyer on an unlisted row")
	admin.quiet("admin on an unlisted row")

	tradeExec(t, w.app, `UPDATE stock SET is_listed = true WHERE id = 's-private'`)

	owner.hear("stock", "s-private")

	for _, sock := range socks {
		sock.hear("listing", "s-private")
	}
}

// A material change goes to every signed-in user.
func TestLiveMaterialGoesToEveryone(t *testing.T) {
	w := newLiveWorld(t)
	socks := joinLive(t, w.app, w.seller, w.buyer, w.admin, w.staff)

	tradeExec(t, w.app, `UPDATE materials SET price = 9 WHERE id = $1`, w.material)

	for _, sock := range socks {
		sock.hear("material", w.material)
	}
}

// A collector goes to the business that made it, admins and staff.
func TestLiveCollectorRouting(t *testing.T) {
	w := newLiveWorld(t)
	socks := joinLive(t, w.app, w.buyer, w.admin, w.staff, w.stranger)

	res := w.buyer.c.Do("POST", "/api/collectors", collectorBody(domainPhone()))
	tradeWant(t, "create collector", res, 200)

	id := res.Body["id"].(string)

	for _, sock := range socks[:3] {
		sock.hear("collector", id)
	}

	socks[3].quiet("stranger")
}

// A review is public: every signed-in user hears it.
func TestLiveReviewGoesToEveryone(t *testing.T) {
	w := newLiveWorld(t)
	tx := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")
	socks := joinLive(t, w.app, w.seller, w.stranger)

	tradeExec(t, w.app, `
		INSERT INTO store_reviews (id, seller_id, buyer_id, transaction_id, rating)
		VALUES ('rv1', $1, $2, $3, 5)`, w.seller.id, w.buyer.id, tx)

	for _, sock := range socks {
		sock.hear("review", "rv1")
	}
}

// An offer's holds tell both people about the request and the owner about
// the stock; the market hears the listing change.
func TestLiveHoldsRouting(t *testing.T) {
	w := newLiveWorld(t)
	id := tradeRequest(t, w.buyer, w.seller, w.stock)
	socks := joinLive(t, w.app, w.seller, w.buyer, w.stranger)

	tradeOffer(t, w.seller, id, w.material, "40", "9")

	socks[0].hear("request", id)
	socks[0].hear("stock", w.stock)
	socks[1].hear("request", id)

	for _, sock := range socks {
		sock.hear("listing", w.stock)
	}
}

// Routine writes to a user (terms, password, avatar) do not wake admins; what
// the admin list shows does.
func TestLiveUserWritesWakeAdminsOnlyForListedColumns(t *testing.T) {
	w := newLiveWorld(t)
	socks := joinLive(t, w.app, w.admin, w.staff)
	admin, staff := socks[0], socks[1]

	tradeExec(t, w.app, `UPDATE users SET agreed_to_terms = true, password_hash = 'x' WHERE id = $1`, w.stranger.id)
	tradeExec(t, w.app, `UPDATE users SET business_name = 'Renamed' WHERE id = $1`, w.stranger.id)

	admin.hear("user", w.stranger.id)
	admin.quiet("admin after the routine write")
	staff.quiet("staff")
}

// A role change takes effect at the next recheck: a demoted admin stops
// hearing admin events and a promoted user starts.
func TestLiveRoleChangeTakesEffectAfterRecheck(t *testing.T) {
	w := newLiveWorld(t)
	promoted := tradeNewUser(t, w.app, "business")
	other := tradeNewUser(t, w.app, "admin")
	socks := joinLive(t, w.app, w.admin, promoted, other)
	demoted, rising, barrier := socks[0], socks[1], socks[2]
	ctx := context.Background()

	rename := func() {
		tradeExec(t, w.app, `UPDATE users SET name = $2 WHERE id = $1`, w.stranger.id, database.NewID())
	}

	rename()
	demoted.hear("user", w.stranger.id)
	barrier.hear("user", w.stranger.id)

	tradeExec(t, w.app, `UPDATE users SET role = 'business' WHERE id = $1`, w.admin.id)
	tradeExec(t, w.app, `UPDATE users SET role = 'admin' WHERE id = $1`, promoted.id)
	demoted.hear("user", w.admin.id)
	demoted.hear("user", promoted.id)
	rising.hear("user", promoted.id)
	w.app.Hub.Recheck(ctx)

	rename()
	barrier.hear("user", w.stranger.id)
	demoted.quiet("demoted admin")
	rising.hear("user", w.stranger.id)
}
