package tests

import (
	"bytes"
	"os"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

// photoList reads the ids and URLs in the "photos" key of a stock response.
func photoList(t *testing.T, result testutil.Response) (ids, urls []string) {
	t.Helper()

	list, ok := result.Body["photos"].([]any)
	if !ok {
		t.Fatalf("photos must be an array: %s", result.Raw)
	}

	for _, entry := range list {
		photo := entry.(map[string]any)
		ids = append(ids, photo["id"].(string))
		urls = append(urls, photo["url"].(string))
	}

	return ids, urls
}

func TestStockPhotosLimitOrderAndDelete(t *testing.T) {
	w := newTradeWorld(t)
	photos := "/api/stock/" + w.stock + "/photos"
	cover := "/api/stock/" + w.stock + "/image"
	anonymous := w.app.NewClient(t)

	var last testutil.Response
	for seed := byte(1); seed <= 8; seed++ {
		last = uploadImage(t, w.app, w.seller.c, photos, receiptImage(seed))
		tradeWant(t, "add photo", last, 200)
	}
	ids, urls := photoList(t, last)
	if len(ids) != 8 {
		t.Fatalf("want 8 photos, got %d", len(ids))
	}

	tradeWant(t, "ninth photo", uploadImage(t, w.app, w.seller.c, photos, receiptImage(9)), 409)
	if count := objectCount(t, w.app, "stock/"+w.stock+"/"); count != 8 {
		t.Fatalf("ninth photo left %d objects", count)
	}

	first := anonymous.Do("GET", cover, nil)
	if first.Status != 200 || !bytes.Equal(first.Raw, receiptImage(1)) {
		t.Fatalf("the first photo is the cover: %d", first.Status)
	}

	// Each of these must be refused with 400 and leave the order alone.
	other := tradeStock(t, w.app, w.buyer.id, w.material, "5", "8")
	tradeWant(t, "other stock photo", uploadImage(t, w.app, w.buyer.c, "/api/stock/"+other+"/photos", receiptImage(1)), 200)
	foreignID := tradeText(t, w.app, `SELECT id FROM stock_photos WHERE stock_id=$1`, other)
	for name, bad := range map[string][]string{
		"missing":   ids[1:],
		"duplicate": append([]string{ids[0]}, ids[:7]...),
		"extra":     append(append([]string{}, ids...), ids[0]),
		"foreign":   append(append([]string{}, ids[:7]...), foreignID),
		"empty":     {},
	} {
		got := w.seller.c.Do("PUT", photos+"/order", map[string]any{"ids": bad})
		if got.Status != 400 {
			t.Fatalf("%s order: status %d: %s", name, got.Status, got.Raw)
		}
	}

	reversed := make([]string, 0, len(ids))
	for i := len(ids) - 1; i >= 0; i-- {
		reversed = append(reversed, ids[i])
	}
	got := w.seller.c.Do("PUT", photos+"/order", map[string]any{"ids": reversed})
	tradeWant(t, "reorder", got, 200)
	newIDs, _ := photoList(t, got)
	if strings.Join(newIDs, ",") != strings.Join(reversed, ",") {
		t.Fatalf("order not saved: %v", newIDs)
	}
	if got.Body["image_url"] == last.Body["image_url"] {
		t.Fatal("a new cover must change the cover URL")
	}
	newCover := anonymous.Do("GET", cover, nil)
	if !bytes.Equal(newCover.Raw, receiptImage(8)) {
		t.Fatal("the cover alias must follow the reorder")
	}

	// Delete the cover: the rest move up and stay numbered 1..n.
	got = w.seller.c.Do("DELETE", photos+"/"+reversed[0], nil)
	tradeWant(t, "delete cover", got, 200)
	rest, _ := photoList(t, got)
	if strings.Join(rest, ",") != strings.Join(reversed[1:], ",") {
		t.Fatalf("delete changed the order: %v", rest)
	}
	positions := tradeText(
		t,
		w.app,
		`SELECT string_agg(position::text, ',' ORDER BY position) FROM stock_photos WHERE stock_id=$1`,
		w.stock,
	)
	if positions != "1,2,3,4,5,6,7" {
		t.Fatalf("positions after delete: %s", positions)
	}
	if count := objectCount(t, w.app, "stock/"+w.stock+"/"); count != 7 {
		t.Fatalf("delete left %d objects", count)
	}
	tradeWant(t, "deleted photo", anonymous.Do("GET", urls[7], nil), 404)
	tradeWant(t, "delete again", w.seller.c.Do("DELETE", photos+"/"+reversed[0], nil), 404)

	// Room again after a delete.
	tradeWant(t, "add after delete", uploadImage(t, w.app, w.seller.c, photos, receiptImage(9)), 200)
}

// Everyone on the business team may change photos; another business may not.
func TestStockPhotosTeamAndOtherBusiness(t *testing.T) {
	w := newTradeWorld(t)
	photos := "/api/stock/" + w.stock + "/photos"
	member := tenantMember(t, w.app, w.seller.id, "member")
	manager := tenantMember(t, w.app, w.seller.id, "manager")
	rival := tenantMember(t, w.app, w.buyer.id, "owner")

	for name, person := range map[string]tradeUser{"member": member, "manager": manager, "owner": w.seller} {
		added := uploadImage(t, w.app, person.c, photos, receiptImage(1))
		tradeWant(t, name+" add", added, 200)
		ids, _ := photoList(t, added)
		tradeWant(t, name+" reorder", person.c.Do("PUT", photos+"/order", map[string]any{"ids": ids}), 200)
		tradeWant(t, name+" delete", person.c.Do("DELETE", photos+"/"+ids[len(ids)-1], nil), 200)
	}

	added := uploadImage(t, w.app, w.seller.c, photos, receiptImage(2))
	tradeWant(t, "seed", added, 200)
	ids, _ := photoList(t, added)

	for _, person := range []tradeUser{rival, w.buyer} {
		tradeWant(t, "rival add", uploadImage(t, w.app, person.c, photos, receiptImage(3)), 404)
		tradeWant(t, "rival reorder", person.c.Do("PUT", photos+"/order", map[string]any{"ids": ids}), 404)
		tradeWant(t, "rival delete", person.c.Do("DELETE", photos+"/"+ids[0], nil), 404)
	}

	if count := tradeText(t, w.app, `SELECT count(*)::text FROM stock_photos WHERE stock_id=$1`, w.stock); count != "1" {
		t.Fatalf("a rival changed the photos: %s", count)
	}
}

// Photos written by 0029 from the old single image_key become photo 1.
func TestStockPhotosMigrationBackfill(t *testing.T) {
	w := newTradeWorld(t)
	file, err := os.ReadFile("../internal/platform/database/migrations/0029_stock_photos.sql")
	if err != nil {
		t.Fatal(err)
	}

	sql := string(file)
	start := strings.Index(sql, "INSERT INTO stock_photos")
	end := start + strings.Index(sql[start:], ";")
	tradeExec(t, w.app, `UPDATE stock SET image_key='stock/old/key' WHERE id=$1`, w.stock)
	tradeExec(t, w.app, sql[start:end])

	if got := tradeText(t, w.app, `SELECT object_key||'@'||position FROM stock_photos WHERE stock_id=$1`, w.stock); got != "stock/old/key@1" {
		t.Fatalf("old photo not carried over as photo 1: %q", got)
	}
}

func TestStockPhotosAreAudited(t *testing.T) {
	w := newTradeWorld(t)
	got := uploadImage(t, w.app, w.seller.c, "/api/stock/"+w.stock+"/photos", receiptImage(1))
	tradeWant(t, "add", got, 200)
	ids, _ := photoList(t, got)

	lines := auditLines(t, w.app, "stock_photos", "id", ids[0])
	if len(lines) != 1 || lines[0].Actor != w.seller.id || lines[0].Action != "insert" {
		t.Fatalf("photo insert not audited with its actor: %v", lines)
	}
	if _, leaked := lines[0].New["object_key"]; leaked {
		t.Fatalf("audit log holds the object key: %v", lines[0].New)
	}
}
