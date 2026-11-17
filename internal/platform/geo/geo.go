// Package geo turns a street address into a map point. A small interface keeps
// the map service swappable. The geocode service wires the cached real provider.
package geo

import (
	"context"
	"errors"
	"hash/fnv"
	"regexp"
	"strconv"
	"strings"
)

// Point is a place on the map in degrees.
type Point struct {
	Lat float64
	Lng float64
}

// ErrNotFound means the service could not place the address.
var ErrNotFound = errors.New("address not found")

// ErrDisabled means no map service is set up, so distance search is off.
var ErrDisabled = errors.New("geocoding is not configured")

// Geocoder turns an address into a point.
type Geocoder interface {
	Geocode(ctx context.Context, address string) (Point, error)
}

// FromName picks the map service by its config name. An empty name means the
// fake in dev and nothing in production; "off" and unknown names mean nothing.
// It never fails, so a wrong setting cannot stop the server.
func FromName(name string, dev bool) Geocoder {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" && dev {
		name = "fake"
	}

	if name == "fake" {
		return Fake{}
	}

	return off{}
}

// Enabled reports whether a map service is set up.
func Enabled(geocoder Geocoder) bool {
	_, none := geocoder.(off)

	return !none
}

type off struct{}

// Geocode always says distance search is off.
func (off) Geocode(context.Context, string) (Point, error) { return Point{}, ErrDisabled }

// Fake is the dev and test geocoder. It needs no network and always gives the
// same point for the same address. An address holding "@lat,lng" is placed
// exactly there; one starting with "fail:" or an empty one cannot be placed.
type Fake struct{}

var pin = regexp.MustCompile(`@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)`)

// Geocode places the address inside South Africa's bounding box.
func (Fake) Geocode(_ context.Context, address string) (Point, error) {
	address = strings.TrimSpace(address)
	if address == "" || strings.HasPrefix(address, "fail:") {
		return Point{}, ErrNotFound
	}

	if m := pin.FindStringSubmatch(address); m != nil {
		lat, _ := strconv.ParseFloat(m[1], 64)
		lng, _ := strconv.ParseFloat(m[2], 64)

		return Point{lat, lng}, nil
	}

	sum := fnv.New64a()
	_, _ = sum.Write([]byte(strings.ToLower(address)))
	bits := sum.Sum64()

	// Latitude -34 to -22, longitude 17 to 33.
	return Point{
		Lat: -34 + float64(bits&0xffffffff)/float64(1<<32)*12,
		Lng: 17 + float64(bits>>32)/float64(1<<32)*16,
	}, nil
}
