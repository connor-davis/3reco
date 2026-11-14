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
	stranger := tradeNewUser(t, w.app, "business")
	anonymous := w.app.NewClient(t)
	collector := tradeNewUser(t, w.app, "collector")

	tradeWant(t, "foreign upload", uploadImage(t, w.app, stranger.c, path, receiptImage(1)), 404)
	tradeWant(t, "foreign delete", stranger.c.Do("DELETE", path, nil), 404)
	tradeWant(t, "anonymous upload", uploadImage(t, w.app, anonymous, path, receiptImage(1)), 401)
	tradeWant(t, "anonymous delete", anonymous.Do("DELETE", path, nil), 401)
	tradeWant(t, "collector upload", uploadImage(t, w.app, collector.c, path, receiptImage(1)), 403)
	tradeWant(t, "collector delete", collector.c.Do("DELETE", path, nil), 403)
	tradeWant(t, "missing photo", anonymous.Do("GET", path, nil), 404)
	missing := uploadImage(t, w.app, w.seller.c, "/api/stock/missing/image", receiptImage(1))
	tradeWant(t, "missing stock", missing, 404)

	for _, data := range [][]byte{nil, []byte("GIF89a"), append(receiptImage(1), make([]byte, 2<<20)...)} {
		tradeWant(t, "invalid image", uploadImage(t, w.app, w.seller.c, path, data), 400)
	}
	if count := objectCount(t, w.app, "stock/"); count != 0 {
		t.Fatalf("invalid or foreign upload stored %d objects", count)
	}

	image := receiptImage(7)
	got := uploadImage(t, w.app, w.seller.c, path, image)
	tradeWant(t, "upload PNG", got, 200)
	url, ok := got.Body["image_url"].(string)
	if !ok || !strings.HasPrefix(url, path+"?v=") {
		t.Fatalf("versioned photo URL missing: %s", got.Raw)
	}
	if _, leaked := got.Body["image_key"]; leaked {
		t.Fatal("stock response exposed its object key")
	}

	for _, client := range []*testutil.Client{w.seller.c, stranger.c, anonymous} {
		public := client.Do("GET", url, nil)
		if public.Status != 200 || !bytes.Equal(public.Raw, image) {
			t.Fatalf("photo bytes: %d %s", public.Status, public.Raw)
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
	tradeWant(t, "upload", uploadImage(t, w.app, w.seller.c, path, receiptImage(1)), 200)

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

func TestStockImageReplacementAndFailedWriteCleanup(t *testing.T) {
	w := newTradeWorld(t)
	path := "/api/stock/" + w.stock + "/image"
	previousURL := ""
	for _, data := range [][]byte{receiptImage(1), receiptJPEG(), []byte("RIFF1234WEBPVP8 " + strings.Repeat("x", 32))} {
		old := tradeText(t, w.app, `SELECT image_key FROM stock WHERE id=$1`, w.stock)
		got := uploadImage(t, w.app, w.seller.c, path, data)
		tradeWant(t, "replace image", got, 200)
		if got.Body["image_url"] == previousURL {
			t.Fatal("replacement kept a stale cache URL")
		}
		previousURL = got.Body["image_url"].(string)
		if old != "" {
			stockObject(t, w.app, old, false)
		}
		if count := objectCount(t, w.app, "stock/"); count != 1 {
			t.Fatalf("replacement left %d objects", count)
		}
	}

	// Make the DB step fail after PUT; the new object must be compensated.
	key := tradeText(t, w.app, `SELECT image_key FROM stock WHERE id=$1`, w.stock)
	tradeExec(
		t,
		w.app,
		`ALTER TABLE stock ADD CONSTRAINT reject_photo CHECK (image_key IS NULL OR image_key='`+key+`')`,
	)
	tradeWant(t, "failed DB write", uploadImage(t, w.app, w.seller.c, path, receiptImage(3)), 500)
	if count := objectCount(t, w.app, "stock/"); count != 1 {
		t.Fatalf("failed write left %d objects", count)
	}
	current := w.seller.c.Do("GET", "/api/stock/"+w.stock, nil)
	if current.Body["image_url"] != previousURL {
		t.Fatal("failed write changed the photo")
	}

	tradeWant(t, "remove photo", w.seller.c.Do("DELETE", path, nil), 200)
	tradeWant(t, "removed photo", w.seller.c.Do("GET", path, nil), 404)
	if count := objectCount(t, w.app, "stock/"); count != 0 {
		t.Fatal("photo removal left an object")
	}
}

func TestStockImageDeleteAndPrivacyWaitForCommit(t *testing.T) {
	w := newTradeWorld(t)
	ctx := context.Background()
	path := "/api/stock/" + w.stock + "/image"
	tradeWant(t, "upload", uploadImage(t, w.app, w.seller.c, path, receiptImage(1)), 200)
	key := tradeText(t, w.app, `SELECT image_key FROM stock WHERE id=$1`, w.stock)
	service := stocksvc.New(w.app.DB, stockstore.New(w.app.DB), w.app.Storage)
	rollback := errors.New("deliberate rollback")

	err := w.app.DB.InTx(ctx, func(ctx context.Context) error {
		if err := service.Delete(ctx, w.stock, w.seller.id); err != nil {
			return err
		}
		stockObject(t, w.app, key, true)

		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatal(err)
	}
	stockObject(t, w.app, key, true)
	tradeWant(t, "stock delete", w.seller.c.Do("DELETE", "/api/stock/"+w.stock, nil), 200)
	stockObject(t, w.app, key, false)

	id := tradeStock(t, w.app, w.seller.id, w.material, "5", "8")
	path = "/api/stock/" + id + "/image"
	tradeWant(t, "upload", uploadImage(t, w.app, w.seller.c, path, receiptImage(2)), 200)
	key = tradeText(t, w.app, `SELECT image_key FROM stock WHERE id=$1`, id)
	export := w.seller.c.Do("GET", "/api/privacy/export", nil)
	tradeWant(t, "export", export, 200)
	stock := export.Body["stock"].([]any)
	if len(stock) != 1 || stock[0].(map[string]any)["has_image"] != true ||
		bytes.Contains(export.Raw, []byte(key)) {
		t.Fatalf("own export must flag the photo without its object key: %s", export.Raw)
	}

	err = w.app.DB.InTx(ctx, func(ctx context.Context) error {
		if err := w.app.Privacy.Erase(ctx, w.seller.id, w.seller.id); err != nil {
			return err
		}
		stockObject(t, w.app, key, true)

		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatal(err)
	}
	stockObject(t, w.app, key, true)
	deleted := w.seller.c.Do("POST", "/api/privacy/delete", map[string]any{"password": goodPassword})
	tradeWant(t, "privacy erase", deleted, 200)
	stockObject(t, w.app, key, true)
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
