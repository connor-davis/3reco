package tests

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func collectorWithEmail(t *testing.T, user *testutil.Client, email string) testutil.Response {
	t.Helper()

	body := collectorBody("")
	body["email"] = email

	return user.Do("POST", "/api/collectors", body)
}

func TestRound3CollectorEmailUniquePerBusiness(t *testing.T) {
	app := testutil.Server(t)
	first, _ := domainUser(t, app, "business")
	second, _ := domainUser(t, app, "business")

	id := status(t, collectorWithEmail(t, first, "Eve@Example.test"), 200).Body["id"].(string)

	// Same email in another case is the same email.
	dup := status(t, collectorWithEmail(t, first, "eve@example.TEST"), 409)
	fields, _ := dup.Body["fields"].(map[string]any)
	if fields["email"] == nil {
		t.Fatalf("no friendly field error: %s", dup.Raw)
	}

	if got := tradeText(t, app, `SELECT count(*)::text FROM collectors WHERE lower(email)='eve@example.test'`); got != "1" {
		t.Fatalf("duplicate was saved: %s collectors", got)
	}

	// Another business may use the same email.
	status(t, collectorWithEmail(t, second, "eve@example.test"), 200)

	// Saving the collector with its own email again is not a clash.
	status(t, first.Do("PATCH", "/api/collectors/"+id, map[string]any{"email": "EVE@example.test", "name": "Eve"}), 200)

	// Moving a second collector onto that email is a clash.
	other := status(t, collectorWithEmail(t, first, "other@example.test"), 200).Body["id"].(string)
	status(t, first.Do("PATCH", "/api/collectors/"+other, map[string]any{"email": "eve@example.test"}), 409)
}

func TestRound3CollectorSelectionSortedByName(t *testing.T) {
	app := testutil.Server(t)
	user, _ := domainUser(t, app, "business")

	for i, name := range []string{"Zed", "amy", "Mo"} {
		body := collectorBody("")
		body["name"] = name
		body["email"] = "n" + string(rune('a'+i)) + "@example.test"
		status(t, user.Do("POST", "/api/collectors", body), 200)
	}

	var rows []map[string]any
	if err := json.Unmarshal(status(t, user.Do("GET", "/api/collectors/selection", nil), 200).Raw, &rows); err != nil {
		t.Fatal(err)
	}

	var names []string
	for _, row := range rows {
		names = append(names, row["name"].(string))
	}

	if len(names) != 3 || names[0] != "amy" || names[1] != "Mo" || names[2] != "Zed" {
		t.Fatalf("not A to Z: %v", names)
	}
}

func TestRound3CollectorsPageAToZAcrossPages(t *testing.T) {
	app := testutil.Server(t)
	user, _ := domainUser(t, app, "business")

	names := []string{"Zed", "amy", "Mo", "Bea", "bea", "Cy", "Al"}
	for i, name := range names {
		body := collectorBody("")
		body["name"] = name
		body["email"] = fmt.Sprintf("p%d@example.test", i)
		status(t, user.Do("POST", "/api/collectors", body), 200)
	}

	walk := func(path string) (got []string, pages int) {
		cursor := ""
		seen := map[string]bool{}

		for {
			url := path + "limit=2"
			if cursor != "" {
				url += "&cursor=" + cursor
			}

			result := status(t, user.Do("GET", url, nil), 200)
			pages++

			for _, row := range pageItems(t, result) {
				id := row["id"].(string)
				if seen[id] {
					t.Fatalf("repeated row %v", row["name"])
				}

				seen[id] = true
				got = append(got, row["name"].(string))
			}

			next, _ := result.Body["next_cursor"].(string)
			if next == "" {
				return got, pages
			}

			cursor = next
		}
	}

	got, pages := walk("/api/collectors?")
	if pages != 4 || len(got) != 7 {
		t.Fatalf("pages %d rows %v", pages, got)
	}

	for i := 1; i < len(got); i++ {
		if strings.ToLower(got[i-1]) > strings.ToLower(got[i]) {
			t.Fatalf("not A to Z: %v", got)
		}
	}

	// Search narrows before the page is cut, and the order holds.
	found, _ := walk("/api/collectors?q=bea&")
	if len(found) != 2 {
		t.Fatalf("search rows: %v", found)
	}

	status(t, user.Do("GET", "/api/collectors?cursor=!!", nil), 400)
}
