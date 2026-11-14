package tests

import "testing"

func TestBusinessTransactionDirections(t *testing.T) {
	w := newTradeWorld(t)
	member := tenantMember(t, w.app, w.seller.id, "member")
	manager := tenantMember(t, w.app, w.seller.id, "manager")
	other := tradeNewUser(t, w.app, "business")
	outsider := tenantMember(t, w.app, other.id, "manager")
	tradeStock(t, w.app, w.buyer.id, w.material, "20", "8")
	sold := tradeSale(t, w.seller, w.buyer, w.material, "2", "8")
	bought := tradeSale(t, w.buyer, w.seller, w.material, "2", "8")
	collector := tradeCollector(t, w.app, w.seller, "+27800001018")
	body := tradeCollection(collector, "", tradeLine(w.material, "1", "2"))
	response := status(t, w.seller.c.Do("POST", "/api/transactions/collections", body), 200)
	collection := response.Body["transaction_id"].(string)

	for _, person := range []tradeUser{w.seller, manager, member} {
		for _, list := range []struct {
			path string
			want map[string]bool
		}{
			{"", map[string]bool{sold: true, bought: true, collection: true}},
			{"/purchases", map[string]bool{bought: true, collection: true}},
			{"/sales", map[string]bool{sold: true}},
		} {
			path := "/api/transactions" + list.path
			rows := pageItems(t, status(t, person.c.Do("GET", path, nil), 200))
			if len(rows) != len(list.want) {
				t.Fatalf("%s returned %d rows, want %d", path, len(rows), len(list.want))
			}
			for _, row := range rows {
				if !list.want[row["id"].(string)] {
					t.Fatalf("wrong direction: %v", row)
				}
			}
			if rows := pageItems(t, status(t, outsider.c.Do("GET", path, nil), 200)); len(rows) != 0 {
				t.Fatalf("other business saw trades: %v", rows)
			}
		}
	}

	for _, export := range []struct {
		kind string
		want map[string]bool
	}{
		{"purchases", map[string]bool{bought: true, collection: true}},
		{"sales", map[string]bool{sold: true}},
	} {
		path := "/api/exports/" + export.kind
		status(t, member.c.Do("GET", path, nil), 403)
		rows := csvRows(t, manager.c, path)
		if len(rows) != len(export.want)+1 {
			t.Fatalf("%s: wrong export row count %v", path, rows)
		}
		for _, row := range rows[1:] {
			if !export.want[row[0]] {
				t.Fatalf("%s: foreign export row %v", path, row)
			}
		}
		if rows := csvRows(t, outsider.c, path); len(rows) != 1 {
			t.Fatalf("other business exported trades: %v", rows)
		}
	}
}
