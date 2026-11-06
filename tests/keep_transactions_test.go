package tests

import (
	"context"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/database"
)

// keepTrade makes a sale with one receipt and returns the transaction id.
func keepTrade(t *testing.T, w tradeWorld) string {
	t.Helper()

	id := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")

	tradeExec(t, w.app, `
		INSERT INTO transaction_receipts
			(id, transaction_id, object_key, file_name, content_type, size, uploaded_by)
		VALUES ($1, $2, 'k', 'r.jpg', 'image/jpeg', 10, $3)`, database.NewID(), id, w.seller.id)

	return id
}

func TestTransactionsCannotBeDeleted(t *testing.T) {
	w := newTradeWorld(t)
	id := keepTrade(t, w)
	pool := w.app.DB.Pool
	ctx := context.Background()

	for _, sql := range []string{
		`DELETE FROM transactions WHERE id = '` + id + `'`,
		`DELETE FROM transaction_items WHERE transaction_id = '` + id + `'`,
		`DELETE FROM transaction_receipts WHERE transaction_id = '` + id + `'`,
		`TRUNCATE transactions CASCADE`,
		`TRUNCATE transaction_items`,
		`TRUNCATE transaction_receipts`,
	} {
		_, err := pool.Exec(ctx, sql)
		if err == nil || !strings.Contains(err.Error(), "never deleted") {
			t.Errorf("%s: want the never-deleted error, got %v", sql, err)
		}
	}

	// UPDATE stays allowed: the privacy jobs rely on it.
	tradeExec(t, w.app, `UPDATE transactions SET anonymised_at = now() WHERE id = $1`, id)
}

func TestEraseKeepsTheUsersTransactions(t *testing.T) {
	w := newTradeWorld(t)
	id := keepTrade(t, w)

	status(t, w.seller.c.Do("POST", "/api/privacy/delete", map[string]any{"password": goodPassword}), 200)

	for table, want := range map[string]string{
		"transactions":         "1",
		"transaction_items":    "1",
		"transaction_receipts": "1",
	} {
		col := "transaction_id"
		if table == "transactions" {
			col = "id"
		}

		got := tradeText(t, w.app, `SELECT count(*)::text FROM `+table+` WHERE `+col+` = $1`, id)
		if got != want {
			t.Errorf("%s: %s rows after the erase, want %s", table, got, want)
		}
	}
}

func TestUsedMaterialCannotBeDeleted(t *testing.T) {
	w := newTradeWorld(t)
	admin, _ := domainUser(t, w.app, "admin")
	keepTrade(t, w)

	res := status(t, admin.Do("DELETE", "/api/admin/materials/"+w.material, nil), 409)
	if !strings.Contains(string(res.Raw), "used in past trades") {
		t.Errorf("unclear message: %s", res.Raw)
	}

	status(t, admin.Do("GET", "/api/materials/"+w.material, nil), 200)
}
