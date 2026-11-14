package tests

import "testing"

func TestLiveStoreLogoWakesListings(t *testing.T) {
	w := newLiveWorld(t)
	socks := joinLive(t, w.app, w.seller, w.buyer, w.admin, w.staff)

	got := uploadImage(t, w.app, w.seller.c, "/api/business/logo", receiptImage(1))
	tradeWant(t, "upload logo", got, 200)
	socks[0].hear("user", w.seller.id)
	socks[2].hear("user", w.seller.id)
	for _, sock := range socks {
		sock.hear("listing", w.seller.id)
		sock.quiet("after logo event")
	}
}

func TestLiveStockPhotoWakesListings(t *testing.T) {
	w := newLiveWorld(t)
	socks := joinLive(t, w.app, w.seller, w.buyer, w.admin)
	path := "/api/stock/" + w.stock + "/image"

	tradeWant(t, "upload photo", uploadImage(t, w.app, w.seller.c, path, receiptImage(1)), 200)
	socks[0].hear("stock", w.stock)
	for _, sock := range socks {
		sock.hear("listing", w.stock)
		sock.quiet("after photo event")
	}
}
