package tests

import (
	"bytes"
	"context"
	"testing"

	tstore "github.com/connor-davis/3reco/internal/stores/transactions"
	"github.com/connor-davis/3reco/tests/testutil"
)

func TestTenantLogoReplacementKeepsPersonalPicture(t *testing.T) {
	w := newTradeWorld(t)
	oldPicture := receiptImage(1)
	status(t, uploadImage(t, w.app, w.seller.c, "/api/profile/avatar", oldPicture), 200)
	key := tradeText(t, w.app, `SELECT avatar_key FROM users WHERE id=$1`, w.seller.id)
	// The migration leaves both references pointing at this one existing object.
	tradeExec(t, w.app, `UPDATE businesses SET avatar_key=$2 WHERE id=$1`, w.seller.id, key)

	newLogo := receiptImage(2)
	status(t, uploadImage(t, w.app, w.seller.c, "/api/business/logo", newLogo), 200)
	personal := status(t, w.seller.c.Do("GET", "/api/users/"+w.seller.id+"/avatar", nil), 200)
	logo := status(t, w.seller.c.Do("GET", "/api/stores/"+w.seller.id+"/logo", nil), 200)
	if !bytes.Equal(personal.Raw, oldPicture) || !bytes.Equal(logo.Raw, newLogo) {
		t.Fatal("a store logo replacement changed or deleted the personal picture")
	}

	legacy := "https://brand.example.test/legacy-logo.png"
	tradeExec(t, w.app, `UPDATE businesses SET image=$2 WHERE id=$1`, w.seller.id, legacy)
	status(t, w.seller.c.Do("DELETE", "/api/business/logo", nil), 200)
	member := tenantMember(t, w.app, w.seller.id, "member")
	status(t, member.c.Do("PATCH", "/api/profile", map[string]any{"image": "https://person.example.test/picture.png"}), 200)
	store := status(t, member.c.Do("GET", "/api/stores/"+w.seller.id, nil), 200)
	if store.Body["avatar_url"] != legacy {
		t.Fatal("a personal picture edit replaced the business's legacy logo")
	}
}

func TestTenantRemovedFounderLosesBillingAndPrivateHistory(t *testing.T) {
	w := newTradeWorld(t)
	tenantMember(t, w.app, w.seller.id, "owner")
	tradeStock(t, w.app, w.buyer.id, w.material, "10", "8")
	tradeExec(t, w.app, `DELETE FROM business_members WHERE business_id=$1 AND user_id=$1`, w.seller.id)
	trade := tradeSale(t, w.buyer, w.seller, w.material, "1", "8")

	status(t, w.seller.c.Do("GET", "/api/transactions/"+trade, nil), 404)
	document, err := tstore.New(w.app.DB, testutil.Cipher(t)).Document(context.Background(), trade, payoutFull)
	if err != nil {
		t.Fatal(err)
	}
	if document.Buyer.Email != "" {
		t.Fatalf("a removed founder still receives business invoices: %q", document.Buyer.Email)
	}

	export := status(t, w.seller.c.Do("GET", "/api/privacy/export", nil), 200)
	if bytes.Contains(export.Raw, []byte(trade)) {
		t.Fatalf("a removed founder exported private trade history: %s", export.Raw)
	}
}
