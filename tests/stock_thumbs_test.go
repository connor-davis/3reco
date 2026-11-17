package tests

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

// wideImage is a flat-colour PNG, so it is big in pixels but small in bytes.
func wideImage(width, height int) []byte {
	picture := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := range height {
		for x := range width {
			picture.Set(x, y, color.RGBA{R: uint8(x * 255 / width), G: 120, B: 60, A: 255})
		}
	}

	var out bytes.Buffer
	_ = png.Encode(&out, picture)

	return out.Bytes()
}

func TestStockThumbMadeOnUploadAndServed(t *testing.T) {
	w := newTradeWorld(t)
	anonymous := w.app.NewClient(t)
	full := wideImage(1200, 800)

	got := uploadImage(t, w.app, w.seller.c, "/api/stock/"+w.stock+"/photos", full)
	tradeWant(t, "upload", got, 200)
	_, urls := photoList(t, got)

	// The small copy sits next to the full image in storage.
	if count := objectCount(t, w.app, "stock/"+w.stock+"/"); count != 2 {
		t.Fatalf("an upload must store the photo and its small copy, found %d objects", count)
	}

	thumb := anonymous.Do("GET", urls[0]+"&size=thumb", nil)
	tradeWant(t, "thumb", thumb, 200)
	picture, err := jpeg.Decode(bytes.NewReader(thumb.Raw))
	if err != nil {
		t.Fatalf("the small copy must be a JPEG: %v", err)
	}
	if bounds := picture.Bounds(); bounds.Dx() != 400 || bounds.Dy() != 266 {
		t.Fatalf("small copy is %dx%d, want 400x266", bounds.Dx(), bounds.Dy())
	}
	if len(thumb.Raw) >= len(full) {
		t.Fatalf("small copy (%d bytes) is not smaller than the photo (%d)", len(thumb.Raw), len(full))
	}

	// The full photo, with or without the size word, is untouched.
	original := anonymous.Do("GET", urls[0], nil)
	if original.Status != 200 || !bytes.Equal(original.Raw, full) {
		t.Fatalf("the full photo changed: %d", original.Status)
	}

	// The cover route and the market card point at the small copy.
	cover := anonymous.Do("GET", "/api/stock/"+w.stock+"/image?size=thumb", nil)
	if cover.Status != 200 || !bytes.Equal(cover.Raw, thumb.Raw) {
		t.Fatalf("cover small copy: %d", cover.Status)
	}
	items := pageItems(t, anonymous.Do("GET", "/api/market/listings", nil))
	thumbURL, _ := items[0]["thumb_url"].(string)
	if !strings.HasPrefix(thumbURL, "/api/stock/"+w.stock+"/image?size=thumb&v=") {
		t.Fatalf("listing must carry thumb_url: %v", items[0])
	}
	if items[0]["image_url"] == thumbURL {
		t.Fatal("image_url must stay the full photo")
	}
}

func TestStockThumbFallsBackForOldPhoto(t *testing.T) {
	w := newTradeWorld(t)
	anonymous := w.app.NewClient(t)
	full := wideImage(800, 600)

	got := uploadImage(t, w.app, w.seller.c, "/api/stock/"+w.stock+"/photos", full)
	tradeWant(t, "upload", got, 200)

	// A photo saved before small copies existed has no thumb_key.
	tradeExec(t, w.app, `UPDATE stock_photos SET thumb_key=NULL WHERE stock_id=$1`, w.stock)

	old := anonymous.Do("GET", "/api/stock/"+w.stock+"/image?size=thumb", nil)
	if old.Status != 200 || !bytes.Equal(old.Raw, full) {
		t.Fatalf("an old photo must answer a small-copy request with the full image: %d", old.Status)
	}
}

func TestStockThumbBadImageIsRejected(t *testing.T) {
	w := newTradeWorld(t)

	// The first bytes say PNG, so the type check passes; the rest is garbage.
	broken := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte("x"), 64)...)
	got := uploadImage(t, w.app, w.seller.c, "/api/stock/"+w.stock+"/photos", broken)
	tradeWant(t, "undecodable image", got, 400)
	if !strings.Contains(string(got.Raw), "small copy") {
		t.Fatalf("error must say why: %s", got.Raw)
	}

	if count := objectCount(t, w.app, "stock/"); count != 0 {
		t.Fatalf("a rejected upload stored %d objects", count)
	}
	if rows := tradeText(t, w.app, `SELECT count(*)::text FROM stock_photos WHERE stock_id=$1`, w.stock); rows != "0" {
		t.Fatalf("a rejected upload saved %s photo rows", rows)
	}
}

// The small copy goes through the same route as the photo, so it must obey the
// same rule: a stranger sees it only while the lot is listed and its seller verified.
func TestStockThumbAccessMatchesFullPhoto(t *testing.T) {
	w := newTradeWorld(t)
	stranger := tradeNewUser(t, w.app, "business")
	anonymous := w.app.NewClient(t)
	thumb := "/api/stock/" + w.stock + "/image?size=thumb"
	tradeWant(t, "upload", uploadImage(t, w.app, w.seller.c, "/api/stock/"+w.stock+"/photos", wideImage(900, 600)), 200)

	tradeWant(t, "listed lot", stranger.c.Do("GET", thumb, nil), 200)

	tradeExec(t, w.app, `UPDATE stock SET is_listed=false WHERE id=$1`, w.stock)
	tradeWant(t, "unlisted: stranger", stranger.c.Do("GET", thumb, nil), 404)
	tradeWant(t, "unlisted: anonymous", anonymous.Do("GET", thumb, nil), 404)
	tradeWant(t, "unlisted: owner", w.seller.c.Do("GET", thumb, nil), 200)
	tradeExec(t, w.app, `UPDATE stock SET is_listed=true WHERE id=$1`, w.stock)

	tradeUnverify(t, w.app, w.seller)
	tradeWant(t, "unverified: stranger", stranger.c.Do("GET", thumb, nil), 404)
	tradeWant(t, "unverified: anonymous", anonymous.Do("GET", thumb, nil), 404)
	tradeWant(t, "unverified: owner", w.seller.c.Do("GET", thumb, nil), 200)
}
