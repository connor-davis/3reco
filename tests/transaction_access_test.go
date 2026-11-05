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
		tradeWant(t, "staff adds "+p, staff.c.Do("POST", p, map[string]any{}), 404)
		tradeWant(t, "outsider adds "+p, outsider.c.Do("POST", p, map[string]any{}), 404)
		tradeWant(t, "anonymous adds "+p, anon.Do("POST", p, map[string]any{}), 401)
	}
}
