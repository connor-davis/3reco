package tests

import (
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestListingFulfillment(t *testing.T) {
	app := testutil.Server(t)
	owner, ownerID := domainUser(t, app, "business")
	other, _ := domainUser(t, app, "business")
	public := app.NewClient(t)
	material := domainMaterial(t, app, "Glass", "2")
	tradeExec(t, app, `UPDATE businesses SET street_address='73 Private Street' WHERE id=$1`, ownerID)

	for _, mode := range []string{"pickup", "delivery", "both"} {
		created := status(t, owner.Do("POST", "/api/stock", map[string]any{
			"material_id": material, "weight": "10", "price": "3", "is_listed": true,
			"fulfillment_mode": mode, "pickup_area": "  Bellville  ",
		}), 200)
		id := created.Body["id"].(string)
		item := status(t, owner.Do("GET", "/api/stock/"+id, nil), 200).Body
		if item["fulfillment_mode"] != mode || item["pickup_area"] != "Bellville" {
			t.Fatalf("terms not saved: %+v", item)
		}

		status(t, other.Do("PATCH", "/api/stock/"+id, map[string]any{
			"fulfillment_mode": "delivery", "pickup_area": "Other town",
		}), 404)
		item = status(t, public.Do("GET", "/api/market/listings/"+id, nil), 200).Body
		assertListingAddressPrivate(t, item)
		if item["fulfillment_mode"] != mode || item["pickup_area"] != "Bellville" {
			t.Fatalf("foreign write changed public terms: %+v", item)
		}

		status(t, owner.Do("PATCH", "/api/stock/"+id, map[string]any{
			"fulfillment_mode": "both", "pickup_area": "Parow",
		}), 200)
		// An unrelated patch must retain the seller's terms.
		status(t, owner.Do("PATCH", "/api/stock/"+id, map[string]any{"price": "4"}), 200)
		item = status(t, public.Do("GET", "/api/market/listings/"+id, nil), 200).Body
		assertListingAddressPrivate(t, item)
		if item["fulfillment_mode"] != "both" || item["pickup_area"] != "Parow" {
			t.Fatalf("updated terms lost: %+v", item)
		}
	}

	for _, path := range []string{"/api/market/listings", "/api/stores/" + ownerID + "/listings"} {
		for _, item := range pageItems(t, status(t, public.Do("GET", path, nil), 200)) {
			if item["fulfillment_mode"] != "both" || item["pickup_area"] != "Parow" {
				t.Fatalf("public list terms missing: %+v", item)
			}
			assertListingAddressPrivate(t, item)
		}
	}

	legacy := domainStock(t, owner, material, true)
	item := status(t, public.Do("GET", "/api/market/listings/"+legacy, nil), 200).Body
	if item["fulfillment_mode"] != "" || item["pickup_area"] != "" {
		t.Fatalf("legacy stock invented terms: %+v", item)
	}
	assertListingAddressPrivate(t, item)

	for _, patch := range []map[string]any{
		{"fulfillment_mode": "courier"}, {"fulfillment_mode": ""},
		{"pickup_area": strings.Repeat("a", 121)}, {"pickup_area": "Town\nStreet"},
	} {
		status(t, owner.Do("PATCH", "/api/stock/"+legacy, patch), 400)
		patch["material_id"], patch["weight"], patch["price"] = material, "10", "3"
		status(t, owner.Do("POST", "/api/stock", patch), 400)
	}

	status(t, owner.Do("PATCH", "/api/stock/"+legacy, map[string]any{
		"fulfillment_mode": "pickup", "pickup_area": strings.Repeat("é", 120),
	}), 200)
	status(t, owner.Do("PATCH", "/api/stock/"+legacy, map[string]any{"pickup_area": ""}), 200)
	item = status(t, public.Do("GET", "/api/market/listings/"+legacy, nil), 200).Body
	if item["pickup_area"] != "" {
		t.Fatalf("area not cleared: %+v", item)
	}
}

func assertListingAddressPrivate(t *testing.T, item map[string]any) {
	t.Helper()

	for key, value := range item {
		if key == "street_address" || value == "73 Private Street" {
			t.Fatalf("private address in public listing: %+v", item)
		}
	}
	noPrivateKeys(t, item)
}
