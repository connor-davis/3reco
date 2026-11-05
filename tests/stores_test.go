package tests

import (
	"context"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/tests/testutil"
)

func TestStoresAndPublicReviews(t *testing.T) {
	app := testutil.Server(t)
	seller, sellerID := domainUser(t, app, "business")
	buyer, buyerID := domainUser(t, app, "business")
	anonymous := app.NewClient(t)
	material := domainMaterial(t, app, "Copper", "2")
	domainStock(t, seller, material, true)
	domainStock(t, seller, material, false)
	transactionID := database.NewID()
	reviewID := database.NewID()
	_, err := app.DB.Pool.Exec(
		context.Background(),
		`INSERT INTO transactions(id,seller_id,buyer_id,type,total_price)
		VALUES($1,$2,$3,'b2b',10)`,
		transactionID,
		sellerID,
		buyerID,
	)
	if err != nil {
		t.Fatal(err)
	}

	_, err = app.DB.Pool.Exec(
		context.Background(),
		`INSERT INTO store_reviews(id,seller_id,buyer_id,transaction_id,rating,comment)
		VALUES($1,$2,$3,$4,4,'Good trade')`,
		reviewID,
		sellerID,
		buyerID,
		transactionID,
	)
	if err != nil {
		t.Fatal(err)
	}

	for _, client := range []*testutil.Client{buyer, anonymous} {
		result := status(t, client.Do("GET", "/api/stores/"+sellerID, nil), 200)
		noPrivateKeys(t, result.Body)
		if result.Body["item_count"] != float64(1) || result.Body["average_rating"] != float64(4) ||
			result.Body["review_count"] != float64(1) {
			t.Fatalf("store: %s", result.Raw)
		}

		result = status(t, client.Do("GET", "/api/stores/"+sellerID+"/reviews", nil), 200)
		noPrivateKeys(t, result.Body)
		items := pageItems(t, result)
		if len(items) != 1 || items[0]["id"] != reviewID || items[0]["reviewer_name"] == "" {
			t.Fatalf("reviews: %s", result.Raw)
		}

		if _, ok := items[0]["transaction_id"]; ok {
			t.Fatal("review leaked transaction")
		}

		result = status(t, client.Do("GET", "/api/stores/"+sellerID+"/reviews/summary", nil), 200)
		if result.Body["average"] != float64(4) || result.Body["count"] != float64(1) {
			t.Fatalf("summary: %s", result.Raw)
		}
	}

	result := status(t, buyer.Do("GET", "/api/stores?q=Business&limit=1", nil), 200)
	items := pageItems(t, result)
	if len(items) != 1 || items[0]["id"] != sellerID {
		t.Fatalf("store directory: %s", result.Raw)
	}
	status(t, anonymous.Do("GET", "/api/stores/missing", nil), 404)
	status(t, anonymous.Do("GET", "/api/stores/missing/reviews", nil), 200)
	status(t, anonymous.Do("GET", "/api/stores/missing/reviews/summary", nil), 200)
}
