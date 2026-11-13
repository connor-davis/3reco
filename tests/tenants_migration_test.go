package tests

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestBusinessMigrationMovesFieldsWithoutRewritingTrades(t *testing.T) {
	db := testutil.NewDB(t)
	ctx := context.Background()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `CREATE SCHEMA legacy; SET LOCAL search_path=legacy`); err != nil {
		t.Fatal(err)
	}

	root := "../internal/platform/database/migrations"
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}

	for _, entry := range entries {
		if entry.Name() >= "0025" || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		body, err := os.ReadFile(filepath.Join(root, entry.Name()))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, string(body)); err != nil {
			t.Fatalf("%s: %v", entry.Name(), err)
		}
	}

	sealed := testutil.Seal(t, "123456789")
	_, err = tx.Exec(ctx, `INSERT INTO users
		(id,role,business_name,business_registration_number,bank_account_number,avatar_key,
		business_verified_at) VALUES('founder','business','Recycled Goods','2020/123/07',$1,'logo',now())`, sealed)
	if err != nil {
		t.Fatal(err)
	}

	_, err = tx.Exec(ctx, `INSERT INTO users(id,role,bank_account_number,street_address)
		VALUES('collector','collector','personal','1 Personal Street');
		INSERT INTO sessions(id,user_id,token_hash,expires_at)
		VALUES('session','founder','hash',now()+interval '1 day');
		INSERT INTO materials(id,name,carbon_factor,gw_code,price) VALUES('material','Glass',2,'GW',5);
		INSERT INTO transactions(id,type,status,seller_id,buyer_id,total_price,collector_snapshot)
		VALUES('trade','b2b','complete','founder','founder',12.34,'{"unchanged":true}');
		INSERT INTO transaction_items(transaction_id,position,material_id,weight,price)
		VALUES('trade',0,'material',1.25,9.872);`)
	if err != nil {
		t.Fatal(err)
	}

	var before string
	if err := tx.QueryRow(ctx, `SELECT to_jsonb(t)::text FROM transactions t WHERE id='trade'`).Scan(&before); err != nil {
		t.Fatal(err)
	}

	body, err := os.ReadFile(filepath.Join(root, "0025_business_tenants.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, string(body)); err != nil {
		t.Fatal(err)
	}

	var name, account, role, active, personal, after string
	var dropped int
	err = tx.QueryRow(ctx, `SELECT b.business_name,b.bank_account_number,m.role,s.active_business_id,
		(SELECT bank_account_number FROM users WHERE id='collector'),
		(SELECT to_jsonb(t)::text FROM transactions t WHERE id='trade'),
		(SELECT count(*) FROM information_schema.columns WHERE table_schema='legacy'
		 AND table_name='users' AND column_name IN ('business_name','business_registration_number',
		 'business_verified_at','business_verified_by'))
		FROM businesses b JOIN business_members m ON m.business_id=b.id
		JOIN sessions s ON s.user_id=m.user_id WHERE b.id='founder'`).Scan(
		&name, &account, &role, &active, &personal, &after, &dropped)
	if err != nil {
		t.Fatal(err)
	}

	if name != "Recycled Goods" || account != sealed || role != "owner" || active != "founder" ||
		personal != "personal" || before != after || dropped != 0 {
		t.Fatalf("move changed identity, ciphertext, personal data or history: %s %s %s %s %s %d",
			name, account, role, active, personal, dropped)
	}
}
