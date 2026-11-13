package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// tradeBusiness creates a business and owner explicitly; users no longer holds its fields.
func tradeBusiness(t *testing.T, app *testutil.App, id, name string, verified bool) {
	t.Helper()

	tradeExec(t, app, `INSERT INTO businesses
		(id,business_name,bank_account_holder_name,bank_name,bank_account_number,bank_branch_code,
		bank_account_type,street_address,city,province,area_code,avatar_key,image,business_verified_at)
		SELECT id,$2,bank_account_holder_name,bank_name,bank_account_number,bank_branch_code,
		bank_account_type,street_address,city,province,area_code,avatar_key,image,
		CASE WHEN $3 THEN now() END FROM users WHERE id=$1
		ON CONFLICT(id) DO UPDATE SET business_name=EXCLUDED.business_name,
		business_verified_at=EXCLUDED.business_verified_at`, id, name, verified)
	tradeExec(t, app, `INSERT INTO business_members VALUES($1,$1,'owner') ON CONFLICT DO NOTHING`, id)
}
