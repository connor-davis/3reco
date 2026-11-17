package demo

// Everything here is made up. Names say "Demo", emails end in .test (a domain
// that can never exist), and phone and bank numbers belong to nobody.

// Password is the one password every demo login has. It is public on the
// demo sign-in page, so it must never be used anywhere real.
const Password = "Demo-Passw0rd!"

// Demo logins, shown as one-click buttons on the demo sign-in page.
const (
	BuyerEmail     = "buyer@demo.test"
	SellerEmail    = "seller@demo.test"
	CollectorEmail = "collector@demo.test"
)

// adminEmail is a seed-only account that makes the materials. Its password is
// random and thrown away, so nobody can sign in as it.
const adminEmail = "admin@demo.test"

// fakeBankNumber is an account number no bank issues.
const fakeBankNumber = "62000111222"

// material is one catalog entry. Prices are cents per kg.
type material struct {
	name, carbon, code string
	cents              int
}

var materials = []material{
	{"Cardboard", "1.5", "GW01", 120}, {"Mixed paper", "1.3", "GW02", 90},
	{"Clear glass", "0.9", "GW03", 60}, {"Green glass", "0.9", "GW04", 50},
	{"PET plastic", "2.1", "GW05", 450}, {"HDPE plastic", "1.9", "GW06", 380},
	{"Aluminium cans", "9.0", "GW07", 1800}, {"Steel cans", "1.8", "GW08", 220},
	{"Copper wire", "3.5", "GW09", 9500}, {"Brass", "3.0", "GW10", 6200},
	{"Used cooking oil", "2.5", "GW11", 600}, {"E-waste boards", "20.0", "GW12", 4000},
}

// person is one dummy login.
type person struct {
	key, email, first, last, role string
	business                      string
	city, province                string
}

var (
	buyerPerson = person{
		"buyer", BuyerEmail, "Thandi", "Demo", "business",
		"Demo Buyer Recycling", "Johannesburg", "Gauteng",
	}
	sellerPerson = person{
		"seller", SellerEmail, "Pieter", "Demo", "business",
		"Demo Seller Scrap", "Pretoria", "Gauteng",
	}
	collectorBusinessPerson = person{
		"collector_business", "collectors@demo.test", "Lerato", "Demo", "business",
		"Demo Collect Co", "Soweto", "Gauteng",
	}
	collectorPerson = person{
		"collector", CollectorEmail, "Zanele", "Demo", "collector", "", "Soweto", "Gauteng",
	}
	backgroundPeople = []person{
		{"bg1", "bg1@demo.test", "Back", "Ground1", "business", "Demo Cape Cardboard", "Cape Town", "Western Cape"},
		{"bg2", "bg2@demo.test", "Back", "Ground2", "business", "Demo Durban Glass", "Durban", "KwaZulu-Natal"},
		{"bg3", "bg3@demo.test", "Back", "Ground3", "business", "Demo Eastern Plastics", "Gqeberha", "Eastern Cape"},
		{"bg4", "bg4@demo.test", "Back", "Ground4", "business", "Demo Highveld Metals", "Germiston", "Gauteng"},
	}
)

// pickupAreas rotate over the sellers' listings so some show where to collect.
var pickupAreas = []string{"Sandton", "Pretoria East", "Soweto", "Germiston"}

var quickReplies = []string{
	"Hi! Yes, this is still available.",
	"We can load on Friday morning. Does that work?",
	"Thanks, I will send the final weights shortly.",
}
