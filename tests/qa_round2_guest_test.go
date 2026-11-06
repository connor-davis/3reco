package tests

import (
	"testing"

	"github.com/connor-davis/3reco/tests/testutil"
)

func TestRound2GuestStatsAndUnreadStayForbidden(t *testing.T) {
	app := testutil.Server(t)
	guest, _ := newGuest(t, app)

	for _, path := range []string{"/api/stats", "/api/notifications/unread-count"} {
		status(t, guest.Do("GET", path, nil), 403)
	}
}
