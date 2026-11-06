package tests

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/fasthttp/websocket"
)

// closeCode reads until the server closes the socket and returns its code.
func closeCode(t *testing.T, s *socket) int {
	t.Helper()

	for range 5 {
		_ = s.conn.SetReadDeadline(time.Now().Add(5 * time.Second))

		var ev map[string]any

		err := s.conn.ReadJSON(&ev)
		if err == nil {
			continue
		}

		var closed *websocket.CloseError
		if errors.As(err, &closed) {
			return closed.Code
		}

		t.Fatalf("read: %v", err)
	}

	t.Fatal("socket was not closed")

	return 0
}

// A removed user's socket closes with the "session ended" code, so the open
// tab can sign out at once instead of reconnecting.
func TestLiveRemovedUserGetsSessionEndedCode(t *testing.T) {
	w := newTradeWorld(t)
	sock := joinLive(t, w.app, w.seller)[0]
	ctx := context.Background()

	if _, err := w.app.DB.Pool.Exec(ctx, `UPDATE users SET is_removed = true WHERE id = $1`, w.seller.id); err != nil {
		t.Fatal(err)
	}

	w.app.Hub.Recheck(ctx)

	if code := closeCode(t, sock); code != 4401 {
		t.Fatalf("close code = %d, want 4401", code)
	}
}

// A user sent back to guest is closed the same way.
func TestLiveGuestedUserGetsSessionEndedCode(t *testing.T) {
	w := newTradeWorld(t)
	sock := joinLive(t, w.app, w.buyer)[0]
	ctx := context.Background()

	if _, err := w.app.DB.Pool.Exec(ctx, `UPDATE users SET role = 'guest' WHERE id = $1`, w.buyer.id); err != nil {
		t.Fatal(err)
	}

	w.app.Hub.Recheck(ctx)

	if code := closeCode(t, sock); code != 4401 {
		t.Fatalf("close code = %d, want 4401", code)
	}
}

// A user whose account is erased is closed at once with the same code.
func TestLiveDisconnectUserGetsSessionEndedCode(t *testing.T) {
	w := newTradeWorld(t)
	sock := joinLive(t, w.app, w.seller)[0]

	w.app.Hub.DisconnectUser(w.seller.id)

	if code := closeCode(t, sock); code != 4401 {
		t.Fatalf("close code = %d, want 4401", code)
	}
}
