package tests

import (
	"context"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestStockVisibilityDoesNotNotifyActor(t *testing.T) {
	app := testutil.Server(t)
	owner, ownerID := domainUser(t, app, "business")
	material := domainMaterial(t, app, "Copper", "2")
	id := domainStock(t, owner, material, false)

	for _, listed := range []bool{true, false} {
		status(t, owner.Do("PATCH", "/api/stock/"+id, map[string]any{"is_listed": listed}), 200)
		result := status(t, owner.Do("GET", "/api/stock/"+id, nil), 200)
		if result.Body["is_listed"] != listed {
			t.Fatalf("is_listed: got %v, want %v", result.Body["is_listed"], listed)
		}

		var count int
		err := app.DB.Pool.QueryRow(
			context.Background(),
			`SELECT count(*) FROM notifications
			WHERE user_id=$1 AND type IN ('stock_listed', 'stock_unlisted')`,
			ownerID,
		).Scan(&count)
		if err != nil {
			t.Fatal(err)
		}

		if count != 0 {
			t.Fatalf("is_listed=%v created %d self-notifications", listed, count)
		}

		bell := status(t, owner.Do("GET", "/api/notifications/unread-count", nil), 200)
		if bell.Body["count"] != float64(0) {
			t.Fatalf("stock visibility changed the owner's bell: %s", bell.Raw)
		}
	}
}
