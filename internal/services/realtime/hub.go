// Package realtime pushes "something changed" events to browsers. A Postgres
// trigger sends one NOTIFY per write; the Hub listens, and tells every client
// that joined a matching topic. Events hold a topic and a row id, never row
// data: the browser refetches through the normal, checked routes.
package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
)

const (
	channel      = "threereco_changes"
	sendBuffer   = 64
	recheckEvery = 30 * time.Second
)

// Event is what a client receives. Type is "changed", "resync" or "pong".
type Event struct {
	Type  string `json:"type"`
	Topic string `json:"topic,omitempty"`
	ID    string `json:"id,omitempty"`
}

// Client is one open WebSocket as the hub sees it.
type Client struct {
	UserID    string
	Role      string
	SessionID string

	send   chan []byte
	topics map[string]struct{} // guarded by Hub.mu
	closed chan struct{}
	once   sync.Once
}

// Send is the stream of encoded events for the socket writer.
func (c *Client) Send() <-chan []byte { return c.send }

// Closed is closed when the hub drops the client.
func (c *Client) Closed() <-chan struct{} { return c.closed }

// Hub fans database changes out to clients.
type Hub struct {
	db   *database.DB
	auth *auth.Service

	mu      sync.Mutex
	clients map[*Client]struct{}
	byTopic map[string]map[*Client]struct{}
}

// New builds a hub. Call Run to start listening.
func New(db *database.DB, a *auth.Service) *Hub {
	return &Hub{
		db:      db,
		auth:    a,
		clients: map[*Client]struct{}{},
		byTopic: map[string]map[*Client]struct{}{},
	}
}

// Join adds a client for a signed-in session. It has no topics yet.
func (h *Hub) Join(sess auth.Session) *Client {
	c := &Client{
		UserID:    sess.User.ID,
		SessionID: sess.ID,
		send:      make(chan []byte, sendBuffer),
		topics:    map[string]struct{}{},
		closed:    make(chan struct{}),
	}

	if sess.User.Role != nil {
		c.Role = *sess.User.Role
	}

	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()

	return c
}

// Leave removes a client and everything it joined. It is safe to call twice.
func (h *Hub) Leave(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[c]; !ok {
		return
	}

	delete(h.clients, c)

	for topic := range c.topics {
		h.dropLocked(c, topic)
	}

	c.once.Do(func() { close(c.closed) })
}

// DisconnectUser closes every socket the user has open, at once. The 30 second
// recheck would drop them anyway; an erased account should not wait.
func (h *Hub) DisconnectUser(userID string) {
	h.mu.Lock()

	var open []*Client

	for c := range h.clients {
		if c.UserID == userID {
			open = append(open, c)
		}
	}

	h.mu.Unlock()

	for _, c := range open {
		h.Leave(c)
	}
}

// Subscribe adds a topic after checking the client may hear it.
func (h *Hub) Subscribe(ctx context.Context, c *Client, topic string) error {
	if err := h.allowed(ctx, c, topic); err != nil {
		return err
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[c]; !ok {
		return apperr.Unauthorized("Connection closed.")
	}

	c.topics[topic] = struct{}{}

	if h.byTopic[topic] == nil {
		h.byTopic[topic] = map[*Client]struct{}{}
	}

	h.byTopic[topic][c] = struct{}{}

	return nil
}

// Unsubscribe drops one topic. A topic the client never joined is ignored.
func (h *Hub) Unsubscribe(c *Client, topic string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.dropLocked(c, topic)
	delete(c.topics, topic)
}

func (h *Hub) dropLocked(c *Client, topic string) {
	delete(h.byTopic[topic], c)

	if len(h.byTopic[topic]) == 0 {
		delete(h.byTopic, topic)
	}
}

// allowed decides who may join which topic. A topic that ends in a user id is
// only for that user; the admin topics are for staff.
func (h *Hub) allowed(ctx context.Context, c *Client, topic string) error {
	kind, id, _ := strings.Cut(topic, ":")
	denied := apperr.Forbidden("You cannot follow that.")

	switch kind {
	case "notifications", "stock", "cart", "transactions", "requests":
		if id == c.UserID {
			return nil
		}

	case "market", "materials":
		if id == "" {
			return nil
		}

	case "admin":
		switch id {
		case "users":
			if c.Role == auth.RoleAdmin {
				return nil
			}
		case "transactions", "requests":
			if c.Role == auth.RoleAdmin || c.Role == auth.RoleStaff {
				return nil
			}
		}

	case "request":
		if id == "" {
			break
		}

		if c.Role == auth.RoleAdmin || c.Role == auth.RoleStaff {
			return nil
		}

		var ok bool

		err := h.db.Pool.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM transaction_requests
				WHERE id = $1 AND (seller_id = $2 OR buyer_id = $2))`, id, c.UserID).Scan(&ok)
		if err != nil {
			return err
		}

		if ok {
			return nil
		}
	}

	return denied
}

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

		var msg struct {
			ID     string   `json:"id"`
			Topics []string `json:"topics"`
		}

		if err := json.Unmarshal([]byte(n.Payload), &msg); err != nil {
			slog.Warn("bad realtime payload", "err", err)

			continue
		}

		for _, topic := range msg.Topics {
			h.publish(topic, Event{Type: "changed", Topic: topic, ID: msg.ID})
		}
	}
}

func (h *Hub) publish(topic string, ev Event) {
	data, _ := json.Marshal(ev)

	h.mu.Lock()
	defer h.mu.Unlock()

	for c := range h.byTopic[topic] {
		h.pushLocked(c, data)
	}
}

func (h *Hub) broadcast(ev Event) {
	data, _ := json.Marshal(ev)

	h.mu.Lock()
	defer h.mu.Unlock()

	for c := range h.clients {
		h.pushLocked(c, data)
	}
}

// Reply sends one event to one client only (pong, errors).
func (h *Hub) Reply(c *Client, ev Event) {
	data, _ := json.Marshal(ev)

	h.mu.Lock()
	defer h.mu.Unlock()

	h.pushLocked(c, data)
}

// pushLocked never blocks. A client that cannot keep up is dropped, and its
// browser reconnects and refetches.
func (h *Hub) pushLocked(c *Client, data []byte) {
	select {
	case c.send <- data:
	default:
		delete(h.clients, c)

		for topic := range c.topics {
			h.dropLocked(c, topic)
		}

		c.once.Do(func() { close(c.closed) })
	}
}

// recheckLoop makes sure sockets do not outlive their sign-in or their rights.
func (h *Hub) recheckLoop(ctx context.Context) {
	tick := time.NewTicker(recheckEvery)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			h.Recheck(ctx)
		}
	}
}

// Recheck drops every socket whose session ended and every topic its client may
// no longer follow. The loop runs it every recheckEvery; tests call it directly.
func (h *Hub) Recheck(ctx context.Context) {
	h.mu.Lock()

	type snapshot struct {
		c      *Client
		topics []string
	}

	var all []snapshot

	for c := range h.clients {
		s := snapshot{c: c}
		for topic := range c.topics {
			s.topics = append(s.topics, topic)
		}

		all = append(all, s)
	}

	h.mu.Unlock()

	if len(all) == 0 {
		return
	}

	// One query for every live session and one for every joined request topic,
	// instead of one per socket and per topic.
	sessionIDs := make([]string, 0, len(all))
	requestIDs := []string{}

	for _, s := range all {
		sessionIDs = append(sessionIDs, s.c.SessionID)

		for _, topic := range s.topics {
			if kind, id, _ := strings.Cut(topic, ":"); kind == "request" && id != "" {
				requestIDs = append(requestIDs, id)
			}
		}
	}

	live, err := h.liveSessions(ctx, sessionIDs)
	if err != nil {
		// ponytail: a database hiccup drops every socket, as it did one by one
		// before; browsers reconnect, so it only costs one refetch each.
		live = nil
	}

	parties, err := h.requestParties(ctx, requestIDs)
	if err != nil {
		parties = nil
	}

	for _, s := range all {
		if _, ok := live[s.c.SessionID]; !ok {
			h.Leave(s.c)

			continue
		}

		for _, topic := range s.topics {
			if err := h.recheckTopic(ctx, s.c, topic, parties); err != nil {
				h.Unsubscribe(s.c, topic)
			}
		}
	}
}

// recheckTopic is allowed, except a request topic is judged from the batch of
// parties already read, so it costs no query.
func (h *Hub) recheckTopic(ctx context.Context, c *Client, topic string, parties map[string][2]string) error {
	kind, id, _ := strings.Cut(topic, ":")
	if kind != "request" || id == "" || c.Role == auth.RoleAdmin || c.Role == auth.RoleStaff {
		return h.allowed(ctx, c, topic)
	}

	if p, ok := parties[id]; ok && (p[0] == c.UserID || p[1] == c.UserID) {
		return nil
	}

	return apperr.Forbidden("You cannot follow that.")
}

// liveSessions returns which of the session ids are unexpired and belong to a
// user who has not been removed.
func (h *Hub) liveSessions(ctx context.Context, ids []string) (map[string]struct{}, error) {
	rows, err := h.db.Pool.Query(ctx, `
		SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.id = ANY($1) AND s.expires_at > now() AND NOT u.is_removed`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	live := map[string]struct{}{}

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		live[id] = struct{}{}
	}

	return live, rows.Err()
}

// requestParties maps each request id to its seller and buyer.
func (h *Hub) requestParties(ctx context.Context, ids []string) (map[string][2]string, error) {
	parties := map[string][2]string{}
	if len(ids) == 0 {
		return parties, nil
	}

	rows, err := h.db.Pool.Query(ctx,
		`SELECT id, seller_id, buyer_id FROM transaction_requests WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id, seller, buyer string
		if err := rows.Scan(&id, &seller, &buyer); err != nil {
			return nil, err
		}

		parties[id] = [2]string{seller, buyer}
	}

	return parties, rows.Err()
}
