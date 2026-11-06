package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestMaterialsAdminOnly(t *testing.T) {
	app := testutil.Server(t)
	admin, _ := domainUser(t, app, "admin")
	member, _ := domainUser(t, app, "collector")
	staff, _ := domainUser(t, app, "staff")
	anonymous := app.NewClient(t)
	body := map[string]any{"name": "Copper", "price": "2.1234567890123456789", "carbon_factor": "2.25", "gw_code": "GW1"}
	id := status(t, admin.Do("POST", "/api/admin/materials", body), 200).Body["id"].(string)

	for _, client := range []*testutil.Client{anonymous, member, staff} {
		want := 403
		if client == anonymous {
			want = 401
		}

		status(t, client.Do("POST", "/api/admin/materials", body), want)
		status(t, client.Do("PATCH", "/api/admin/materials/"+id, body), want)
		status(t, client.Do("DELETE", "/api/admin/materials/"+id, nil), want)

		noPrivateKeys(t, status(t, client.Do("GET", "/api/materials/"+id, nil), 200).Body)
		if items := pageItems(t, status(t, client.Do("GET", "/api/materials", nil), 200)); len(items) != 1 {
			t.Fatalf("catalog count: %d", len(items))
		}
		status(t, client.Do("GET", "/api/materials?all=true", nil), 200)
	}

	status(t, admin.Do("PATCH", "/api/admin/materials/"+id, map[string]any{"name": "Updated"}), 200)
	result := status(t, anonymous.Do("GET", "/api/materials/"+id, nil), 200)
	if result.Body["price"] != body["price"] || result.Body["carbon_factor"] != "2.25" {
		t.Fatalf("PATCH lost fields: %s", result.Raw)
	}

	status(t, admin.Do("PATCH", "/api/admin/materials/"+id, map[string]any{"price": "-1"}), 400)
	status(
		t,
		admin.Do("PATCH", "/api/admin/materials/"+id, map[string]any{"carbon_factor": "Infinity"}),
		400,
	)
	status(t, admin.Do("DELETE", "/api/admin/materials/"+id, nil), 200)
	status(t, anonymous.Do("GET", "/api/materials/"+id, nil), 404)

	material := domainMaterial(t, app, "Paper", "2")
	owner, _ := domainUser(t, app, "business")
	domainStock(t, owner, material, false)
	status(t, admin.Do("DELETE", "/api/admin/materials/"+material, nil), 409)
}
