package tests

import "testing"

func TestTransactionAccess(t *testing.T) {
	w := newTradeWorld(t)
	outsider := tradeNewUser(t, w.app, "business")
	staff := tradeNewUser(t, w.app, "staff")
	anon := w.app.NewClient(t)
	id := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")

	path := "/api/transactions/" + id

	tradeWant(t, "buyer detail", w.buyer.c.Do("GET", path, nil), 200)
	tradeWant(t, "seller detail", w.seller.c.Do("GET", path, nil), 200)
	tradeWant(t, "staff detail", staff.c.Do("GET", path, nil), 200)
	tradeWant(t, "outsider detail", outsider.c.Do("GET", path, nil), 404)
	tradeWant(t, "anonymous detail", anon.Do("GET", path, nil), 401)
	tradeWant(t, "missing detail", outsider.c.Do("GET", "/api/transactions/nope", nil), 404)

	// Document routes keep the same concealed access checks after T10.
	tradeWant(t, "buyer invoice", w.buyer.c.Do("GET", path+"/invoice", nil), 200)
	tradeWant(t, "staff invoice", staff.c.Do("GET", path+"/invoice", nil), 200)
	tradeWant(t, "outsider invoice", outsider.c.Do("GET", path+"/invoice", nil), 404)
	tradeWant(t, "anonymous invoice", anon.Do("GET", path+"/invoice", nil), 401)

	tradeWant(t, "buyer receipt", w.buyer.c.Do("GET", path+"/receipts/r1", nil), 404)
	tradeWant(t, "outsider receipt", outsider.c.Do("GET", path+"/receipts/r1", nil), 404)
	tradeWant(t, "anonymous receipt", anon.Do("GET", path+"/receipts/r1", nil), 401)

	for _, p := range []string{path + "/receipts"} {
		tradeWant(t, "seller adds "+p, w.seller.c.Do("POST", p, map[string]any{}), 400)
		tradeWant(t, "staff adds without file "+p, staff.c.Do("POST", p, map[string]any{}), 400)
		tradeWant(t, "outsider adds "+p, outsider.c.Do("POST", p, map[string]any{}), 404)
		tradeWant(t, "anonymous adds "+p, anon.Do("POST", p, map[string]any{}), 401)
	}
}

// The collector user of a collector sale can open the row their list shows;
// another collector cannot.
func TestCollectorUserReadsOwnSale(t *testing.T) {
	w := newTradeWorld(t)
	mine := tradeNewUser(t, w.app, "collector")
	other := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, mine.phone)

	res := w.buyer.c.Do("POST", "/api/transactions/collections",
		tradeCollection(collector, "", tradeLine(w.material, "10", "6")))
	tradeWant(t, "collection", res, 200)

	id := res.Body["transaction_id"].(string)

	list := mine.c.Do("GET", "/api/transactions/sales", nil)
	tradeWant(t, "own sales list", list, 200)

	if n := len(tradeItems(list)); n != 1 {
		t.Fatalf("own sales list has %d rows, want 1: %s", n, list.Raw)
	}

	tradeWant(t, "own collector sale", mine.c.Do("GET", "/api/transactions/"+id, nil), 200)
	tradeWant(t, "another collector", other.c.Do("GET", "/api/transactions/"+id, nil), 404)
	tradeWant(t, "a stranger business", w.seller.c.Do("GET", "/api/transactions/"+id, nil), 404)
}
