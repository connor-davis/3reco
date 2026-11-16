package tests

import (
	"reflect"
	"testing"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

func TestPriceHistory(t *testing.T) {
	app := testutil.Server(t)
	buyer := tradeNewUser(t, app, "business")
	outsider := tradeNewUser(t, app, "business")
	sellers := []tradeUser{
		tradeNewUser(t, app, "business"),
		tradeNewUser(t, app, "business"),
		tradeNewUser(t, app, "business"),
	}
	material := tradeMaterial(t, app, "Trend glass", "1")
	path := "/api/materials/" + material + "/price-history"

	read := func(c *testutil.Client) []any {
		t.Helper()

		response := status(t, c.Do("GET", path, nil), 200)
		if len(response.Body) != 1 {
			t.Fatalf("unexpected envelope: %s", response.Raw)
		}

		weeks, ok := response.Body["weeks"].([]any)
		if !ok || len(weeks) != 12 {
			t.Fatalf("want 12 weekly buckets: %s", response.Raw)
		}

		for index, raw := range weeks {
			week := raw.(map[string]any)
			if len(week) != 3 {
				t.Fatalf("unexpected bucket fields: %v", week)
			}
			for key := range week {
				if key != "period" && key != "avg_price" && key != "status" {
					t.Fatalf("private or unexpected field %q", key)
				}
			}

			day, err := time.Parse("2006-01-02", week["period"].(string))
			if err != nil || day.Weekday() != time.Monday {
				t.Fatalf("week must start on Monday: %v", week)
			}
			if index > 0 {
				previous, _ := time.Parse("2006-01-02", weeks[index-1].(map[string]any)["period"].(string))
				if day.Sub(previous) != 7*24*time.Hour {
					t.Fatalf("bucket spacing: %v", weeks)
				}
			}
		}

		return weeks
	}
	checkHidden := func() {
		t.Helper()

		for _, raw := range read(outsider.c) {
			week := raw.(map[string]any)
			if week["avg_price"] != nil || week["status"] != "not_enough_deals" {
				t.Fatalf("a suppressed week exposed a price: %v", week)
			}
		}
	}

	t.Run("empty", func(t *testing.T) { checkHidden() })

	// Four actual API sales establish that price is per kg, with unequal weights.
	for _, seller := range sellers {
		tradeStock(t, app, seller.id, material, "100", "2")
	}
	tradeSale(t, sellers[0], buyer, material, "1", "2")
	tradeSale(t, sellers[1], buyer, material, "1", "2")
	tradeSale(t, sellers[2], buyer, material, "1", "2")
	tradeSale(t, sellers[0], buyer, material, "1", "2")
	t.Run("four deals three stores hides", func(t *testing.T) { checkHidden() })

	last := tradeSale(t, sellers[1], buyer, material, "4", "10")
	t.Run("five deals three stores exact weighted average", func(t *testing.T) {
		weeks := read(outsider.c)
		latest := weeks[11].(map[string]any)
		if latest["avg_price"] != "6.00" || latest["status"] != "available" {
			t.Fatalf("want (4*2 + 4*10)/8 = 6.00: %v", latest)
		}
		if !reflect.DeepEqual(weeks, read(sellers[0].c)) || !reflect.DeepEqual(weeks, read(buyer.c)) {
			t.Fatal("participants and outsiders must see the same aggregate")
		}
	})

	t.Run("five deals two stores hides", func(t *testing.T) {
		tradeExec(t, app, `UPDATE transactions SET seller_id=$1 WHERE seller_id=$2`, sellers[0].id, sellers[2].id)
		checkHidden()
		tradeExec(t, app, `UPDATE transactions SET seller_id=$1 WHERE id=(
			SELECT transaction_id FROM transaction_items WHERE material_id=$2 AND transaction_id IN (
				SELECT id FROM transactions WHERE seller_id=$3) ORDER BY transaction_id LIMIT 1)`,
			sellers[2].id, material, sellers[0].id)
	})

	t.Run("non-completed excluded", func(t *testing.T) {
		for _, state := range []string{"pending", "cancelled", "duplicate"} {
			if state == "duplicate" {
				tradeExec(t, app, `UPDATE transactions SET status='duplicate',duplicate_of=(
					SELECT id FROM transactions WHERE id<>$1 ORDER BY id LIMIT 1),
					duplicate_marked_at=now(),duplicate_marked_by=$2 WHERE id=$1`,
					last, buyer.id)
			} else {
				tradeExec(t, app, `UPDATE transactions SET status=$2 WHERE id=$1`, last, state)
			}
			checkHidden()
		}
		tradeExec(t, app, `UPDATE transactions SET status='complete',duplicate_of=NULL,
			duplicate_marked_at=NULL,duplicate_marked_by=NULL WHERE id=$1`, last)
	})

	t.Run("collection and malformed b2b parties excluded", func(t *testing.T) {
		collector := tradeCollector(t, app, buyer, "+27800000951")
		tradeExec(t, app, `UPDATE transactions SET type='c2b',seller_id=$2 WHERE id=$1`, last, collector)
		checkHidden()
		tradeExec(t, app, `UPDATE transactions SET type='b2b' WHERE id=$1`, last)
		checkHidden()
		tradeExec(t, app, `UPDATE transactions SET seller_id=$2 WHERE id=$1`, last, sellers[1].id)
	})

	t.Run("lines do not inflate deal threshold", func(t *testing.T) {
		tradeExec(t, app, `UPDATE transactions SET status='pending' WHERE id=$1`, last)
		tradeExec(t, app, `INSERT INTO transaction_items(transaction_id,position,material_id,weight,price)
			SELECT transaction_id,1,material_id,1,500 FROM transaction_items
			WHERE material_id=$1 AND transaction_id<>$2 LIMIT 1`, material, last)
		checkHidden()
		tradeExec(t, app, `UPDATE transaction_items SET weight=0 WHERE material_id=$1 AND position=1`, material)
		tradeExec(t, app, `UPDATE transactions SET status='complete' WHERE id=$1`, last)
	})

	t.Run("old and future deals excluded", func(t *testing.T) {
		for _, when := range []string{"now() - interval '13 weeks'", "now() + interval '1 week'"} {
			tradeExec(t, app, `UPDATE transactions SET created_at=`+when+` WHERE id=$1`, last)
			checkHidden()
		}
		tradeExec(t, app, `UPDATE transactions SET created_at=now() WHERE id=$1`, last)
	})

	t.Run("access", func(t *testing.T) {
		status(t, app.NewClient(t).Do("GET", path, nil), 401)
		for _, role := range []string{"collector", "guest", "staff", "admin"} {
			user := tradeNewUser(t, app, role)
			if role == "collector" || role == "guest" {
				status(t, user.c.Do("GET", path, nil), 403)
			} else if !reflect.DeepEqual(read(user.c), read(outsider.c)) {
				t.Fatalf("%s saw a different aggregate", role)
			}
		}
		status(t, outsider.c.Do("GET", "/api/materials/"+database.NewID()+"/price-history", nil), 404)
	})
}
