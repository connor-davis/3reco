package tests

import (
	"fmt"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
)

func TestQARound5ACollectorRecentBackdated(t *testing.T) {
	w := newTradeWorld(t)
	user := tradeNewUser(t, w.app, "collector")
	collector := tradeCollector(t, w.app, w.buyer, user.phone)
	var newest, newestDay string
	for i := range 7 {
		newest = database.NewID()
		if i == 5 {
			newestDay = newest
		}
		day := "2026-11-01"
		if i == 6 {
			day = "2026-10-01"
		}

		tradeExec(t, w.app, `INSERT INTO transactions
			(id,seller_id,buyer_id,type,total_price,status,collection_day,created_at)
			VALUES ($1,$2,$3,'c2b',2,'complete',$4,$5::timestamptz)`,
			newest, collector, w.buyer.id, day, fmt.Sprintf("2026-11-02T12:00:%02dZ", i))
		tradeExec(t, w.app, `INSERT INTO transaction_items
			(transaction_id,material_id,weight,price,position) VALUES ($1,$2,1,2,0)`,
			newest, w.material)
	}

	// The dashboard follows recording order; Sales follows the collection date,
	// so the backdated row comes last there.
	recent := status(t, user.c.Do("GET", "/api/transactions/sales?limit=4&order=recorded", nil), 200)
	sales := status(t, user.c.Do("GET", "/api/transactions/sales?limit=50", nil), 200)
	if pageItems(t, recent)[0]["id"] != newest || pageItems(t, sales)[0]["id"] != newestDay {
		t.Fatalf("recent or Sales order is wrong: %s", recent.Raw)
	}

	// Walking the smaller dashboard pages must visit the exact same set as Sales.
	seen := map[string]bool{}
	for {
		for _, row := range pageItems(t, recent) {
			id := row["id"].(string)
			if seen[id] {
				t.Fatal("duplicate collection across pages")
			}
			seen[id] = true
		}
		cursor, _ := recent.Body["next_cursor"].(string)
		if cursor == "" {
			break
		}
		recent = status(t, user.c.Do("GET", "/api/transactions/sales?limit=4&order=recorded&cursor="+cursor, nil), 200)
	}
	if len(seen) != len(pageItems(t, sales)) {
		t.Fatalf("recent and Sales differ: %d vs %d", len(seen), len(pageItems(t, sales)))
	}
}
