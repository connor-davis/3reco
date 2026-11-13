// Package sockets is the WebSocket route, GET /api/live. A signed-in browser
// opens one socket and hears "changed" events for everything it may see; it
// subscribes to nothing and never gets row data.
package sockets

import (
	"encoding/json"
	"time"

	"github.com/gofiber/contrib/v3/websocket"
	"github.com/gofiber/fiber/v3"

	"github.com/connor-davis/3reco/internal/api/middleware"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/realtime"
)

const (
	pingEvery  = 25 * time.Second
	readWindow = 70 * time.Second
	writeLimit = 5 * time.Second
	sessionKey = "session"
)

// Handler serves /api/live.
type Handler struct {
	hub *realtime.Hub
	cfg config.Config
}

// New builds the handler.
func New(hub *realtime.Hub, cfg config.Config) *Handler { return &Handler{hub: hub, cfg: cfg} }

// Register adds GET /live. The upgrade check runs as a normal HTTP request,
// so a bad caller gets a plain JSON error before any socket exists.
func (h *Handler) Register(r fiber.Router) {
	r.Get("/live", h.upgrade, websocket.New(h.conn))
}

// upgrade checks the Origin (CORS does not guard sockets) and the cookie.
func (h *Handler) upgrade(c fiber.Ctx) error {
	if !websocket.IsWebSocketUpgrade(c) {
		return fiber.ErrUpgradeRequired
	}

	if !middleware.TrustedOrigin(c, h.cfg) {
		return apperr.Forbidden("This site may not open a live connection.")
	}

	sess, ok := middleware.CurrentSession(c)
	if !ok {
		return apperr.Unauthorized("Please sign in.")
	}

	c.Locals(sessionKey, sess)

	return c.Next()
}

type request struct {
	Type string `json:"type"`
}

// conn serves one socket. Only the writer goroutine writes to it.
func (h *Handler) conn(conn *websocket.Conn) {
	sess, ok := conn.Locals(sessionKey).(auth.Session)
	if !ok {
		_ = conn.Close()

		return
	}

	client := h.hub.Join(sess)
	defer h.hub.Leave(client)

	go h.write(conn, client)

	_ = conn.SetReadDeadline(time.Now().Add(readWindow))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(readWindow))
	})

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}

		_ = conn.SetReadDeadline(time.Now().Add(readWindow))

		var req request
		if json.Unmarshal(data, &req) != nil {
			continue
		}

		// The only thing a page may say is "ping"; what it hears is not its choice.
		if req.Type == "ping" {
			h.hub.Reply(client, realtime.Event{Type: "pong"})
		}
	}
}

func (h *Handler) write(conn *websocket.Conn, client *realtime.Client) {
	tick := time.NewTicker(pingEvery)
	defer tick.Stop()

	for {
		select {
		case <-client.Closed():
			code, reason := websocket.CloseNormalClosure, ""
			if client.Revoked() {
				code, reason = realtime.CloseSessionEnded, "session-ended"
			}
			// Same code, so old pages still sign out; new pages tell the person why.
			if client.Removed() {
				reason = "account-removed"
			}
			if client.MembershipEnded() {
				code, reason = realtime.CloseMembershipEnded, "membership-ended"
			}

			_ = conn.WriteControl(websocket.CloseMessage,
				websocket.FormatCloseMessage(code, reason),
				time.Now().Add(writeLimit))
			_ = conn.Close()

			return
		case data := <-client.Send():
			_ = conn.SetWriteDeadline(time.Now().Add(writeLimit))

			if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
				h.hub.Leave(client)
			}
		case <-tick.C:
			if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeLimit)); err != nil {
				h.hub.Leave(client)
			}
		}
	}
}
