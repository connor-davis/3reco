package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
)

// Run listens until ctx ends. A dropped connection is retried with a growing
// pause, and clients get a "resync" so they refetch what they missed.
func (h *Hub) Run(ctx context.Context) {
	go h.recheckLoop(ctx)

	wait := time.Second

	for ctx.Err() == nil {
		started := time.Now()
		err := h.listen(ctx)

		if ctx.Err() != nil {
			return
		}

		slog.Warn("realtime listener lost, retrying", "err", err, "in", wait)
		h.broadcast(Event{Type: "resync"})

		// A connection that held for a while resets the pause.
		if time.Since(started) > time.Minute {
			wait = time.Second
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}

		wait = min(wait*2, 30*time.Second)
	}
}

func (h *Hub) listen(ctx context.Context) error {
	conn, err := pgx.Connect(ctx, h.db.URL)
	if err != nil {
		return err
	}
	defer conn.Close(context.WithoutCancel(ctx))

	if _, err := conn.Exec(ctx, "LISTEN "+channel); err != nil {
		return err
	}

	slog.Info("realtime listening")

	for {
		n, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}

		var ch change

		if err := json.Unmarshal([]byte(n.Payload), &ch); err != nil {
			slog.Warn("bad realtime payload", "err", err)

			continue
		}

		h.route(ch)
	}
}
