package geocode

import (
	"testing"

	"github.com/connor-davis/3reco/internal/stores/businesses"
)

func TestAddressNormalization(t *testing.T) {
	code := 8001
	item := businesses.Profile{
		StreetAddress: "  1 LONG\tStreet  ", City: " Cape   Town ",
		Province: " Western Cape ", AreaCode: &code,
	}
	if got := Address(item); got != "1 long street, cape town, 8001, western cape, south africa" {
		t.Fatalf("address = %q", got)
	}
	item.StreetAddress = "  "
	if Address(item) != "" {
		t.Fatal("blank street produced a query")
	}
}
