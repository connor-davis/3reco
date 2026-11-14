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

// Add, reorder and delete each wake the owner's stock and the public market.
func TestLiveStockPhotoWakesListings(t *testing.T) {
	w := newLiveWorld(t)
	socks := joinLive(t, w.app, w.seller, w.buyer, w.admin)
	photos := "/api/stock/" + w.stock + "/photos"

	wake := func(step string) {
		socks[0].hear("stock", w.stock)
		for _, sock := range socks {
			sock.hear("listing", w.stock)
			sock.quiet("after " + step)
		}
	}

	tradeWant(t, "upload photo", uploadImage(t, w.app, w.seller.c, photos, receiptImage(1)), 200)
	wake("add")

	added := uploadImage(t, w.app, w.seller.c, photos, receiptImage(2))
	tradeWant(t, "upload second photo", added, 200)
	wake("second add")

	ids, _ := photoList(t, added)
	tradeWant(t, "reorder", w.seller.c.Do("PUT", photos+"/order", map[string]any{"ids": []string{ids[1], ids[0]}}), 200)
	wake("reorder")

	tradeWant(t, "delete", w.seller.c.Do("DELETE", photos+"/"+ids[0], nil), 200)
	wake("delete")
}

// A photo of unlisted stock tells only its own business.
func TestLiveUnlistedStockPhotoStaysPrivate(t *testing.T) {
	w := newLiveWorld(t)
	tradeExec(t, w.app, `UPDATE stock SET is_listed=false WHERE id=$1`, w.stock)
	socks := joinLive(t, w.app, w.seller, w.buyer)

	tradeWant(t, "upload photo", uploadImage(t, w.app, w.seller.c, "/api/stock/"+w.stock+"/photos", receiptImage(1)), 200)
	socks[0].hear("stock", w.stock)
	socks[0].quiet("owner after unlisted photo")
	socks[1].quiet("stranger after unlisted photo")
}
