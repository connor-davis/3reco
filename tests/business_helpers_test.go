package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// merge joins JSON bodies; later maps win.
func merge(parts ...map[string]any) map[string]any {
	out := map[string]any{}

	for _, part := range parts {
		for key, value := range part {
			out[key] = value
		}
	}

	return out
}

// seedBusinessBank gives a business a whole sealed account number to test with.
func seedBusinessBank(t *testing.T, app *testutil.App, id string) {
	t.Helper()

	tradeExec(t, app, `UPDATE businesses SET bank_account_holder_name='Holder', bank_name='Bank',
		bank_account_number=$2, bank_branch_code='123456', bank_account_type='Savings' WHERE id=$1`,
		id, testutil.Seal(t, "private-account"))
	tradeBackfillLast4(t, app)
}
