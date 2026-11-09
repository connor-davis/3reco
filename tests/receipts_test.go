package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/connor-davis/3reco/tests/testutil"
)

func receiptImage(seed byte) []byte {
	image := image.NewRGBA(image.Rect(0, 0, 2, 2))
	image.Set(0, 0, color.RGBA{R: seed, G: 120, A: 255})
	var out bytes.Buffer
	_ = png.Encode(&out, image)

	return out.Bytes()
}

func receiptJPEG() []byte {
	picture := image.NewRGBA(image.Rect(0, 0, 2, 2))
	var out bytes.Buffer
	_ = jpeg.Encode(&out, picture, nil)

	return out.Bytes()
}

func uploadImage(
	t *testing.T,
	app *testutil.App,
	client *testutil.Client,
	path string,
	data []byte,
) testutil.Response {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "Receipt photo.png")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(data)
	_ = writer.Close()

	req, err := http.NewRequest("POST", app.URL+path, &body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", testutil.WebOrigin)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := client.HTTP.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()

	raw, _ := io.ReadAll(response.Body)
	result := testutil.Response{Status: response.StatusCode, Raw: raw}
	_ = json.Unmarshal(raw, &result.Body)

	return result
}

func objectCount(t *testing.T, app *testutil.App, prefix string) int {
	t.Helper()
	cfg := app.Config
	client, err := minio.New(cfg.S3Endpoint, &minio.Options{
		Creds: credentials.NewStaticV4(cfg.S3AccessKey, cfg.S3SecretKey, ""), Secure: cfg.S3UseTLS,
	})
	if err != nil {
		t.Fatal(err)
	}

	count := 0
	for object := range client.ListObjects(context.Background(), cfg.S3Bucket,
		minio.ListObjectsOptions{Prefix: prefix, Recursive: true}) {
		if object.Err != nil {
			t.Fatal(object.Err)
		}
		count++
	}

	return count
}

func TestReceiptAccessLeak(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")
	path := "/api/transactions/" + id + "/receipts"
	stranger := tradeNewUser(t, w.app, "business")
	staff := tradeNewUser(t, w.app, "staff")
	data := receiptJPEG()

	tradeWant(t, "stranger before parsing", stranger.c.Do("POST", path, nil), 404)
	tradeWant(t, "staff upload", uploadImage(t, w.app, staff.c, path, data), 404)
	tradeWant(t, "anonymous", uploadImage(t, w.app, w.app.NewClient(t), path, data), 401)
	tradeWant(t, "deleted upload route", w.buyer.c.Do("POST", path+"/upload", nil), 404)

	for _, invalid := range [][]byte{nil, []byte("GIF89a fake"), []byte("plain text"),
		[]byte("RIFF1234WEBPVP8 " + strings.Repeat("x", 32)),
		append(receiptImage(3), make([]byte, 5<<20)...)} {
		tradeWant(t, "invalid image", uploadImage(t, w.app, w.buyer.c, path, invalid), 400)
	}

	got := uploadImage(t, w.app, w.seller.c, path, data)
	tradeWant(t, "seller upload", got, 200)
	if strings.Contains(string(got.Raw), "object_key") || got.Body["content_type"] != "image/jpeg" {
		t.Fatalf("unsafe receipt metadata: %s", got.Raw)
	}

	receiptID, _ := got.Body["id"].(string)
	download := path + "/" + receiptID
	for _, client := range []*testutil.Client{w.buyer.c, w.seller.c, staff.c} {
		got := client.Do("GET", download, nil)
		tradeWant(t, "authorized download", got, 200)
		if !bytes.Equal(got.Raw, data) {
			t.Fatal("receipt bytes changed")
		}
	}

	tradeWant(t, "stranger download", stranger.c.Do("GET", download, nil), 404)
	tradeWant(t, "missing attachment", w.buyer.c.Do("GET", path+"/missing", nil), 404)
	other := tradeSale(t, w.seller, w.buyer, w.material, "1", "8")
	tradeWant(t, "other transaction attachment", w.buyer.c.Do("GET",
		"/api/transactions/"+other+"/receipts/"+receiptID, nil), 404)
	tradeWant(t, "duplicate SHA", uploadImage(t, w.app, w.buyer.c, path, data), 409)
	if count := objectCount(t, w.app, "receipts/"); count != 1 {
		t.Fatalf("failed uploads left %d objects, want 1", count)
	}
}

func TestReceiptConcurrentSixthFails(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")
	path := "/api/transactions/" + id + "/receipts"
	for i := byte(1); i <= 4; i++ {
		tradeWant(t, "initial receipt", uploadImage(t, w.app, w.buyer.c, path, receiptImage(i)), 200)
	}

	var pending sync.WaitGroup
	statuses := make(chan int, 2)
	start := make(chan struct{})
	for i := byte(5); i <= 6; i++ {
		pending.Add(1)
		go func(seed byte) {
			defer pending.Done()
			<-start
			statuses <- uploadImage(t, w.app, w.buyer.c, path, receiptImage(seed)).Status
		}(i)
	}
	close(start)
	pending.Wait()
	close(statuses)

	counts := map[int]int{}
	for status := range statuses {
		counts[status]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("concurrent statuses %v", counts)
	}

	if count := objectCount(t, w.app, "receipts/"); count != 5 {
		t.Fatalf("stored receipts %d, want 5", count)
	}
}

func TestReceiptRemove(t *testing.T) {
	w := newTradeWorld(t)
	id := tradeSale(t, w.seller, w.buyer, w.material, "5", "8")
	path := "/api/transactions/" + id + "/receipts"
	stranger := tradeNewUser(t, w.app, "business")
	staff := tradeNewUser(t, w.app, "staff")
	admin := tradeNewUser(t, w.app, "admin")

	for _, caller := range []tradeUser{w.buyer, w.seller, admin, staff} {
		detail := status(t, caller.c.Do("GET", "/api/transactions/"+id, nil), 200)
		if detail.Body["can_remove_receipts"] != (caller.id != staff.id) {
			t.Fatalf("receipt permission for %s: %s", caller.id, detail.Raw)
		}
	}

	upload := func(seed byte, by tradeUser) string {
		got := uploadImage(t, w.app, by.c, path, receiptImage(seed))
		tradeWant(t, "upload", got, 200)

		return path + "/" + got.Body["id"].(string)
	}

	first := upload(1, w.seller)
	other := tradeSale(t, w.seller, w.buyer, w.material, "1", "8")

	tradeWant(t, "anonymous", w.app.NewClient(t).Do("DELETE", first, nil), 401)
	tradeWant(t, "stranger", stranger.c.Do("DELETE", first, nil), 404)
	tradeWant(t, "other transaction", w.buyer.c.Do("DELETE",
		"/api/transactions/"+other+"/receipts/"+first[len(path)+1:], nil), 404)
	tradeWant(t, "missing receipt", w.buyer.c.Do("DELETE", path+"/missing", nil), 404)
	tradeWant(t, "staff can read but not remove", staff.c.Do("DELETE", first, nil), 403)

	if count := objectCount(t, w.app, "receipts/"); count != 1 {
		t.Fatalf("refused deletes left %d objects, want 1", count)
	}

	// Each allowed role removes one receipt: the buyer, the seller who
	// uploaded it, and an admin.
	tradeWant(t, "buyer", w.buyer.c.Do("DELETE", first, nil), 200)
	tradeWant(t, "gone", w.buyer.c.Do("GET", first, nil), 404)
	tradeWant(t, "twice", w.buyer.c.Do("DELETE", first, nil), 404)
	tradeWant(t, "seller", w.seller.c.Do("DELETE", upload(2, w.buyer), nil), 200)
	tradeWant(t, "uploader", w.buyer.c.Do("DELETE", upload(3, w.buyer), nil), 200)
	tradeWant(t, "admin", admin.c.Do("DELETE", upload(4, w.seller), nil), 200)

	if count := objectCount(t, w.app, "receipts/"); count != 0 {
		t.Fatalf("removed receipts left %d objects, want 0", count)
	}

	// The slot is free again and the trade itself is untouched.
	tradeWant(t, "re-upload", uploadImage(t, w.app, w.buyer.c, path, receiptImage(1)), 200)
	tradeWant(t, "trade kept", w.buyer.c.Do("GET", "/api/transactions/"+id, nil), 200)
}
