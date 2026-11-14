package tests

import (
	"net/url"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestRound2CollectorPhoneSearch(t *testing.T) {
	app := testutil.Server(t)
	creator, _ := domainUser(t, app, "business")
	other, _ := domainUnverified(t, app)
	collector, _ := domainUser(t, app, "collector")
	id := status(t, creator.Do("POST", "/api/collectors", collectorBody("0820001010")), 200).Body["id"]

	for _, query := range []string{"0820001010", "082 000 1010", "+27820001010", "27820001010", "820001010", "Collector A"} {
		rows := pageItems(t, status(t, creator.Do("GET", "/api/collectors?q="+url.QueryEscape(query), nil), 200))
		if len(rows) != 1 || rows[0]["id"] != id {
			t.Fatalf("search %q: %v", query, rows)
		}
	}

	rows := pageItems(t, status(t, other.Do("GET", "/api/collectors?q=0820001010", nil), 200))
	if len(rows) != 1 || rows[0]["phone"] == nil || rows[0]["bank_account_number"] == "123456789" {
		t.Fatalf("another business's view: %v", rows)
	}

	status(t, collector.Do("GET", "/api/collectors?q=0820001010", nil), 403)
}
