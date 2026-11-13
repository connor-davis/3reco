package tests

import (
	"context"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// The SQL mask functions give the shapes the owner chose, and never a sealed number's tail.
func TestSQLMaskShapes(t *testing.T) {
	app := testutil.Server(t)

	for query, want := range map[string]string{
		`SELECT mask_last4('62001234567')`:         "•••• 4567",
		`SELECT mask_last4('1234')`:                "••••",
		`SELECT mask_last4('v1:abcdefgh')`:         "••••",
		`SELECT mask_sealed(NULL,'')`:              "",
		`SELECT mask_sealed('v1:abcdefgh','9087')`: "•••• 9087",
		`SELECT mask_sealed('v1:abcdefgh',NULL)`:   "••••",
		`SELECT mask_email('thandi@example.test')`: "t***@example.test",
		`SELECT mask_phone('0821234567')`:          "••• ••• 4567",
	} {
		var got string
		if err := app.DB.Pool.QueryRow(context.Background(), query).Scan(&got); err != nil {
			t.Fatalf("%s: %v", query, err)
		}

		if got != want {
			t.Errorf("%s = %q, want %q", query, got, want)
		}
	}
}
