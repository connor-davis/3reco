package demo

import "fmt"

// seedStock lists about thirty rows across the sellers. Some say where to
// collect from, so the pickup and delivery labels show in the market.
func (s *Seeder) seedStock(
	mats map[string]string,
	people map[string]*account,
) (map[string][]listing, error) {
	keys := []string{"seller", "buyer", "bg1", "bg2", "bg3", "bg4"}
	weights := []int{500, 1200, 2500, 800}
	listings := map[string][]listing{}

	n := 0

	for i, m := range materials {
		for j := range 2 {
			key := keys[(i+j*3)%len(keys)]
			price := money(m.cents * (115 + 10*(n%4)) / 100)

			item, err := listStock(people[key], mats[m.name], fmt.Sprint(weights[n%4]), price, n)
			if err != nil {
				return nil, fmt.Errorf("stock for %s: %w", key, err)
			}

			listings[key] = append(listings[key], item)
			n++
		}
	}

	// The demo seller gets a few big rows a visitor can buy straight away.
	for _, m := range materials {
		switch m.name {
		case "Cardboard", "Clear glass", "PET plastic", "Aluminium cans":
			item, err := listStock(people["seller"], mats[m.name], "5000", money(m.cents*130/100), n)
			if err != nil {
				return nil, err
			}

			listings["seller"] = append(listings["seller"], item)
			n++
		}
	}

	return listings, nil
}

func listStock(owner *account, materialID, weight, price string, n int) (listing, error) {
	body := map[string]any{
		"material_id": materialID, "weight": weight, "price": price, "is_listed": true,
	}

	// Every second row names a mode, the rest keep the default.
	if n%2 == 0 {
		mode := []string{"pickup", "both", "delivery"}[n/2%3]
		body["fulfillment_mode"] = mode

		if mode != "delivery" {
			body["pickup_area"] = pickupAreas[n/2%len(pickupAreas)]
		}
	}

	id, err := owner.c.created("POST", "/api/stock", body)

	return listing{id: id, materialID: materialID, price: price}, err
}

// seedTrades finishes eight deals through the real request flow: ask, chat,
// offer, both sides accept. Each gets a review. They give the dashboard, the
// invoices, the certificates and the price chart something to show.
func (s *Seeder) seedTrades(people map[string]*account, listings map[string][]listing) error {
	deals := []struct {
		buyer, seller string
		rating        int
	}{
		{"bg1", "bg2", 5}, {"bg3", "bg4", 4}, {"bg2", "bg1", 5}, {"buyer", "bg4", 4},
		{"bg1", "buyer", 5}, {"seller", "bg3", 3}, {"buyer", "seller", 5}, {"bg2", "seller", 4},
	}

	for _, d := range deals {
		rows := listings[d.seller]
		if len(rows) == 0 {
			return fmt.Errorf("%s has no stock to trade", d.seller)
		}

		if err := trade(people[d.buyer], people[d.seller], rows[0], d.rating); err != nil {
			return fmt.Errorf("deal %s from %s: %w", d.buyer, d.seller, err)
		}
	}

	return nil
}

func trade(buyer, seller *account, item listing, rating int) error {
	requestID, err := buyer.c.created("POST", "/api/requests", map[string]any{
		"seller_id": seller.id,
		"items":     []map[string]any{{"stock_id": item.id, "weight": "100"}},
	})
	if err != nil {
		return err
	}

	path := "/api/requests/" + requestID

	offer := map[string]any{"items": []map[string]string{
		{"material_id": item.materialID, "weight": "100", "price": item.price},
	}}

	steps := []struct {
		who   *account
		route string
		body  any
	}{
		{buyer, "/messages", map[string]string{"content": "Hi, can you do this weight this week?"}},
		{seller, "/messages", map[string]string{"content": "Yes, collection is possible on Friday."}},
		{seller, "/offer", offer},
		{buyer, "/accept", nil},
	}

	for _, step := range steps {
		if err := step.who.c.call("POST", path+step.route, step.body, nil); err != nil {
			return err
		}
	}

	// The seller made the offer, so their confirmation settles the deal.
	var done struct {
		TransactionID string `json:"transaction_id"`
	}

	if err := seller.c.call("POST", path+"/accept", nil, &done); err != nil {
		return err
	}

	if done.TransactionID == "" {
		return fmt.Errorf("request %s did not settle", requestID)
	}

	review := map[string]any{"rating": rating, "comment": "Smooth deal, honest weights."}

	return buyer.c.call("POST", "/api/transactions/"+done.TransactionID+"/review", review, nil)
}

// seedCollections records one buy from each collector record.
func (s *Seeder) seedCollections(mats map[string]string, people map[string]*account) error {
	for _, name := range []string{"Nomsa Demo", "Jabu Demo", "Zanele Demo"} {
		body := map[string]any{
			"collector_id": people["record:"+name].id,
			"items": []map[string]string{
				{"material_id": mats["Cardboard"], "weight": "40", "price": "1.50"},
				{"material_id": mats["Aluminium cans"], "weight": "12.5", "price": "20.00"},
			},
		}

		route := "/api/transactions/collections"

		if err := people["collector_business"].c.call("POST", route, body, nil); err != nil {
			return fmt.Errorf("collection from %s: %w", name, err)
		}
	}

	return nil
}

// seedExtras adds an open chat, a wanted post and the seller's quick replies.
func (s *Seeder) seedExtras(
	mats map[string]string,
	people map[string]*account,
	listings map[string][]listing,
) error {
	rows := listings["bg1"]
	if len(rows) == 0 {
		return fmt.Errorf("bg1 has no stock for the open chat")
	}

	buyer := people["buyer"]
	other := people["bg1"]

	requestID, err := buyer.c.created("POST", "/api/requests", map[string]any{
		"seller_id": other.id,
		"items":     []map[string]any{{"stock_id": rows[0].id, "weight": "50"}},
	})
	if err != nil {
		return err
	}

	chat := "/api/requests/" + requestID + "/messages"

	if err := buyer.c.call("POST", chat, map[string]string{"content": "Is this still available?"}, nil); err != nil {
		return err
	}

	if err := other.c.call("POST", chat, map[string]string{"content": "Yes, still here."}, nil); err != nil {
		return err
	}

	_, err = buyer.c.created("POST", "/api/wanted", map[string]any{
		"material_id": mats["Cardboard"], "weight": "2000", "max_price": "1.50",
		"area": "Johannesburg", "days": 14,
	})
	if err != nil {
		return fmt.Errorf("wanted post: %w", err)
	}

	for _, text := range quickReplies {
		reply := map[string]string{"body": text}

		if err := people["seller"].c.call("POST", "/api/quick-replies", reply, nil); err != nil {
			return fmt.Errorf("quick reply: %w", err)
		}
	}

	return nil
}
