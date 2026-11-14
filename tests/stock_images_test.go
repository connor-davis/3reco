package tests

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	stocksvc "github.com/connor-davis/3reco/internal/services/stock"
	stockstore "github.com/connor-davis/3reco/internal/stores/stock"
	"github.com/connor-davis/3reco/tests/testutil"
)

func TestStockImageAccessValidationAndProjection(t *testing.T) {
	w := newTradeWorld(t)
	path := "/api/stock/" + w.stock + "/image"
	photos := "/api/stock/" + w.stock + "/photos"
	order := map[string]any{"ids": []string{}}
	stranger := tradeNewUser(t, w.app, "business")
	anonymous := w.app.NewClient(t)
	collector := tradeNewUser(t, w.app, "collector")

	tradeWant(t, "foreign upload", uploadImage(t, w.app, stranger.c, photos, receiptImage(1)), 404)
	tradeWant(t, "foreign delete", stranger.c.Do("DELETE", photos+"/x", nil), 404)
	tradeWant(t, "foreign reorder", stranger.c.Do("PUT", photos+"/order", order), 404)
	tradeWant(t, "anonymous upload", uploadImage(t, w.app, anonymous, photos, receiptImage(1)), 401)
	tradeWant(t, "anonymous delete", anonymous.Do("DELETE", photos+"/x", nil), 401)
	tradeWant(t, "anonymous reorder", anonymous.Do("PUT", photos+"/order", order), 401)
	tradeWant(t, "collector upload", uploadImage(t, w.app, collector.c, photos, receiptImage(1)), 403)
	tradeWant(t, "collector delete", collector.c.Do("DELETE", photos+"/x", nil), 403)
	tradeWant(t, "collector reorder", collector.c.Do("PUT", photos+"/order", order), 403)
	tradeWant(t, "missing photo", anonymous.Do("GET", path, nil), 404)
	missing := uploadImage(t, w.app, w.seller.c, "/api/stock/missing/photos", receiptImage(1))
	tradeWant(t, "missing stock", missing, 404)

	for _, data := range [][]byte{nil, []byte("GIF89a"), append(receiptImage(1), make([]byte, 2<<20)...)} {
		tradeWant(t, "invalid image", uploadImage(t, w.app, w.seller.c, photos, data), 400)
	}
	if count := objectCount(t, w.app, "stock/"); count != 0 {
		t.Fatalf("invalid or foreign upload stored %d objects", count)
	}

	image := receiptImage(7)
	got := uploadImage(t, w.app, w.seller.c, photos, image)
	tradeWant(t, "upload PNG", got, 200)
	url, ok := got.Body["image_url"].(string)
	if !ok || !strings.HasPrefix(url, path+"?v=") {
		t.Fatalf("versioned cover URL missing: %s", got.Raw)
	}
	if _, leaked := got.Body["image_key"]; leaked {
		t.Fatal("stock response exposed its object key")
	}

	list, _ := got.Body["photos"].([]any)
	if len(list) != 1 {
		t.Fatalf("stock response must list its photo: %s", got.Raw)
	}
	photoURL, _ := list[0].(map[string]any)["url"].(string)

	for _, client := range []*testutil.Client{w.seller.c, stranger.c, anonymous} {
		for _, route := range []string{url, photoURL} {
			public := client.Do("GET", route, nil)
			if public.Status != 200 || !bytes.Equal(public.Raw, image) {
				t.Fatalf("photo bytes: %d %s", public.Status, public.Raw)
			}
		}
	}

	response, err := anonymous.HTTP.Get(w.app.URL + url)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.Header.Get("Cache-Control") != "private, max-age=60" || response.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("photo headers: %v", response.Header)
	}

	avatar := uploadImage(t, w.app, w.seller.c, "/api/business/logo", receiptImage(9))
	tradeWant(t, "store logo", avatar, 200)
	store := anonymous.Do("GET", "/api/stores/"+w.seller.id, nil)
	if store.Body["avatar_url"] != "/api/stores/"+w.seller.id+"/logo" {
		t.Fatalf("store logo projection: %s", store.Raw)
	}
	listing := anonymous.Do("GET", "/api/market/listings/"+w.stock, nil)
	tradeWant(t, "listing detail", listing, 200)
	logo, ok := listing.Body["seller_avatar_url"].(string)
	if !ok || !strings.HasPrefix(logo, "/api/stores/"+w.seller.id+"/logo?v=") || listing.Body["image_url"] != url {
		t.Fatalf("listing image projection: %s", listing.Raw)
	}
	urls, _ := listing.Body["image_urls"].([]any)
	if len(urls) != 1 || urls[0] != photoURL {
		t.Fatalf("listing detail must list every photo: %s", listing.Raw)
	}
	for _, route := range []string{"/api/market/listings", "/api/stores/" + w.seller.id + "/listings"} {
		items := pageItems(t, anonymous.Do("GET", route, nil))
		if len(items) != 1 || items[0]["image_url"] != url || items[0]["seller_avatar_url"] != logo {
			t.Fatalf("listing list projection for %s: %v", route, items)
		}
	}
	items := pageItems(t, w.seller.c.Do("GET", "/api/stock", nil))
	if len(items) != 1 || items[0]["image_url"] != url {
		t.Fatalf("stock list photo: %v", items)
	}
}

func TestStockImageVisibilityMatchesMarket(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")
	anonymous := w.app.NewClient(t)
	path := "/api/stock/" + w.stock + "/image"
	tradeWant(t, "upload", uploadImage(t, w.app, w.seller.c, "/api/stock/"+w.stock+"/photos", receiptImage(1)), 200)

	for _, change := range []struct{ hide, restore string }{
		{`UPDATE stock SET is_listed=false WHERE id=$1`, `UPDATE stock SET is_listed=true WHERE id=$1`},
		{`UPDATE stock SET weight=0 WHERE id=$1`, `UPDATE stock SET weight=100 WHERE id=$1`},
		{`UPDATE businesses SET is_removed=true WHERE id=(SELECT owner_id FROM stock WHERE id=$1)`,
			`UPDATE businesses SET is_removed=false WHERE id=(SELECT owner_id FROM stock WHERE id=$1)`},
	} {
		tradeExec(t, w.app, change.hide, w.stock)
		for _, client := range []*testutil.Client{stranger.c, anonymous} {
			tradeWant(t, "hidden photo", client.Do("GET", path, nil), 404)
		}
		tradeExec(t, w.app, change.restore, w.stock)
		tradeWant(t, "visible again", anonymous.Do("GET", path, nil), 200)
	}

	tradeExec(t, w.app, `UPDATE stock SET is_listed=false,weight=0 WHERE id=$1`, w.stock)
	tradeWant(t, "owner reads hidden photo", w.seller.c.Do("GET", path, nil), 200)
}

// The market hides an unverified business's stock, so its photos stay hidden too.
func TestStockImageHiddenWhileSellerUnverified(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")
	anonymous := w.app.NewClient(t)
	admin := tradeNewUser(t, w.app, "admin")
	member := tenantMember(t, w.app, w.seller.id, "member")
	got := uploadImage(t, w.app, w.seller.c, "/api/stock/"+w.stock+"/photos", receiptImage(1))
	tradeWant(t, "upload", got, 200)
	photoURL := got.Body["photos"].([]any)[0].(map[string]any)["url"].(string)
	coverURL := "/api/stock/" + w.stock + "/image"

	tradeUnverify(t, w.app, w.seller)
	for _, route := range []string{coverURL, photoURL} {
		for _, client := range []*testutil.Client{stranger.c, anonymous} {
			tradeWant(t, "unverified photo", client.Do("GET", route, nil), 404)
		}
		for _, client := range []*testutil.Client{w.seller.c, member.c, admin.c} {
			tradeWant(t, "own or staff photo", client.Do("GET", route, nil), 200)
		}
	}

	tradeExec(t, w.app, `UPDATE businesses SET business_verified_at=now() WHERE id=$1`, w.seller.id)
	tradeWant(t, "verified again", anonymous.Do("GET", coverURL, nil), 200)
}

func TestStockPhotoFailedWriteCleanup(t *testing.T) {
	w := newTradeWorld(t)
	photos := "/api/stock/" + w.stock + "/photos"
	tradeWant(t, "first photo", uploadImage(t, w.app, w.seller.c, photos, receiptImage(1)), 200)

	// Make the DB step fail after PUT; the new object must be compensated.
	key := tradeText(t, w.app, `SELECT object_key FROM stock_photos WHERE stock_id=$1`, w.stock)
	tradeExec(
		t,
		w.app,
		`ALTER TABLE stock_photos ADD CONSTRAINT reject_photo CHECK (object_key='`+key+`')`,
	)
	tradeWant(t, "failed DB write", uploadImage(t, w.app, w.seller.c, photos, receiptImage(3)), 500)
	if count := objectCount(t, w.app, "stock/"+w.stock+"/"); count != 1 {
		t.Fatalf("failed write left %d objects", count)
	}

	current := w.seller.c.Do("GET", "/api/stock/"+w.stock, nil)
	if len(current.Body["photos"].([]any)) != 1 {
		t.Fatalf("failed write changed the photos: %s", current.Raw)
	}
}

func TestStockImageDeleteAndPrivacyWaitForCommit(t *testing.T) {
	w := newTradeWorld(t)
	ctx := context.Background()
	photos := "/api/stock/" + w.stock + "/photos"
	tradeWant(t, "upload", uploadImage(t, w.app, w.seller.c, photos, receiptImage(1)), 200)
	tradeWant(t, "upload two", uploadImage(t, w.app, w.seller.c, photos, receiptImage(4)), 200)
	keys := photoKeys(t, w.app, w.stock)
	service := stocksvc.New(w.app.DB, stockstore.New(w.app.DB), w.app.Storage)
	rollback := errors.New("deliberate rollback")

	err := w.app.DB.InTx(ctx, func(ctx context.Context) error {
		if err := service.Delete(ctx, w.stock, w.seller.id); err != nil {
			return err
		}
		stockObjects(t, w.app, keys, true)

		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatal(err)
	}
	stockObjects(t, w.app, keys, true)
	tradeWant(t, "stock delete", w.seller.c.Do("DELETE", "/api/stock/"+w.stock, nil), 200)
	stockObjects(t, w.app, keys, false)

	id := tradeStock(t, w.app, w.seller.id, w.material, "5", "8")
	photos = "/api/stock/" + id + "/photos"
	tradeWant(t, "upload", uploadImage(t, w.app, w.seller.c, photos, receiptImage(2)), 200)
	tradeWant(t, "upload two", uploadImage(t, w.app, w.seller.c, photos, receiptImage(5)), 200)
	keys = photoKeys(t, w.app, id)
	export := w.seller.c.Do("GET", "/api/privacy/export", nil)
	tradeWant(t, "export", export, 200)
	stock := export.Body["stock"].([]any)
	if len(stock) != 1 || stock[0].(map[string]any)["has_image"] != true ||
		stock[0].(map[string]any)["photo_count"] != float64(2) {
		t.Fatalf("own export must flag the photos: %s", export.Raw)
	}
	for _, key := range keys {
		if bytes.Contains(export.Raw, []byte(key)) {
			t.Fatalf("own export leaked an object key: %s", export.Raw)
		}
	}

	err = w.app.DB.InTx(ctx, func(ctx context.Context) error {
		if err := w.app.Privacy.Erase(ctx, w.seller.id, w.seller.id); err != nil {
			return err
		}
		stockObjects(t, w.app, keys, true)

		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatal(err)
	}
	stockObjects(t, w.app, keys, true)
	deleted := w.seller.c.Do("POST", "/api/privacy/delete", map[string]any{"password": goodPassword})
	tradeWant(t, "privacy erase", deleted, 200)
	stockObjects(t, w.app, keys, true)
}

func photoKeys(t *testing.T, app *testutil.App, stockID string) []string {
	t.Helper()
	rows, err := app.DB.Pool.Query(
		context.Background(),
		`SELECT object_key FROM stock_photos WHERE stock_id=$1 ORDER BY position`,
		stockID,
	)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()

	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			t.Fatal(err)
		}
		keys = append(keys, key)
	}
	if len(keys) == 0 {
		t.Fatal("no photo keys")
	}

	return keys
}

func stockObjects(t *testing.T, app *testutil.App, keys []string, exists bool) {
	t.Helper()
	for _, key := range keys {
		stockObject(t, app, key, exists)
	}
}

func stockObject(t *testing.T, app *testutil.App, key string, exists bool) {
	t.Helper()
	reader, err := app.Storage.Get(context.Background(), key)
	if reader != nil {
		_ = reader.Close()
	}
	if (err == nil) != exists {
		t.Fatalf("object %s exists=%v, want %v (error %v)", key, err == nil, exists, err)
	}
}
