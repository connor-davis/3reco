package geo

import (
	"context"
	"errors"
	"testing"
)

func TestFakeIsDeterministicAndPlacesPins(t *testing.T) {
	ctx := context.Background()

	a, err := Fake{}.Geocode(ctx, "1 Main Road, Paarl")
	b, _ := Fake{}.Geocode(ctx, "1 main road, paarl")
	if err != nil || a != b {
		t.Fatalf("same address gave %v and %v (%v)", a, b, err)
	}

	pinned, _ := Fake{}.Geocode(ctx, "Shed 4 @-33.9249,18.4241")
	if pinned != (Point{-33.9249, 18.4241}) {
		t.Fatalf("pin ignored: %v", pinned)
	}

	for _, bad := range []string{"", "  ", "fail:nowhere"} {
		if _, err := (Fake{}).Geocode(ctx, bad); !errors.Is(err, ErrNotFound) {
			t.Fatalf("%q: want not found, got %v", bad, err)
		}
	}
}

func TestFromNameNeverFails(t *testing.T) {
	cases := []struct {
		name    string
		dev     bool
		enabled bool
	}{
		{"", true, true}, {"", false, false}, {"fake", false, true},
		{"off", true, false}, {"nonsense", true, false},
	}
	for _, c := range cases {
		if got := Enabled(FromName(c.name, c.dev)); got != c.enabled {
			t.Fatalf("name=%q dev=%v: enabled %v, want %v", c.name, c.dev, got, c.enabled)
		}
	}
}
