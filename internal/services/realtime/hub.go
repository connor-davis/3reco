// Package realtime pushes "something changed" events to browsers. A Postgres
// trigger sends one NOTIFY per write that names the kind of row, its id and
// who may hear about it; the Hub looks up those people's open sockets and
// tells each of them. A browser holds one socket and subscribes to nothing:
// the server decides who hears what. Events hold a kind and a row id, never
// row data: the browser refetches through the normal, checked routes.
package realtime

import (
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/services/auth"
)

const (
	channel      = "threereco_changes"
	sendBuffer   = 64
	recheckEvery = 30 * time.Second
)

// CloseSessionEnded is the WebSocket close code sent when the person's sign-in
// ended, or they were removed or sent back to guest. A browser seeing it signs
// out at once instead of reconnecting. 4000-4999 is the range for app codes.
const CloseSessionEnded = 4401

// Event is what a client receives. Type is "changed", "resync" or "pong";
// only "changed" carries a Kind and an ID.
type Event struct {
	Type string `json:"type"`
	Kind string `json:"kind,omitempty"`
	ID   string `json:"id,omitempty"`
}

// Client is one open WebSocket as the hub sees it.
type Client struct {
	BusinessID string
	MemberRole string
	UserID     string
	SessionID  string

	role   string // guarded by Hub.mu; the recheck keeps it current
	guest  bool   // guarded by Hub.mu; a guest hears only events sent to their own id
	send   chan []byte
	closed chan struct{}
	once   sync.Once

	revoked atomic.Bool // set when the sign-in ended, so the close code says so
	removed atomic.Bool // set when the account was erased, so the close reason says so
}

// Send is the stream of encoded events for the socket writer.
func (c *Client) Send() <-chan []byte { return c.send }

// Closed is closed when the hub drops the client.
func (c *Client) Closed() <-chan struct{} { return c.closed }

// Revoked reports whether the hub dropped the client because the sign-in ended.
func (c *Client) Revoked() bool { return c.revoked.Load() }

// Removed reports whether the hub dropped the client because the account was erased.
func (c *Client) Removed() bool { return c.removed.Load() }

// Hub fans database changes out to clients.
type Hub struct {
	db   *database.DB
	auth *auth.Service

	mu         sync.Mutex
	clients    map[*Client]struct{}
	byUser     map[string]map[*Client]struct{}
	byRole     map[string]map[*Client]struct{}
	byBusiness map[string]map[*Client]struct{}
}

// New builds a hub. Call Run to start listening.
func New(db *database.DB, a *auth.Service) *Hub {
	return &Hub{
		db:         db,
		auth:       a,
		clients:    map[*Client]struct{}{},
		byUser:     map[string]map[*Client]struct{}{},
		byRole:     map[string]map[*Client]struct{}{},
		byBusiness: map[string]map[*Client]struct{}{},
	}
}

// Join adds a client for a signed-in session. It hears everything the user
// may see from this moment on.
func (h *Hub) Join(sess auth.Session) *Client {
	c := &Client{
		UserID:     sess.User.ID,
		BusinessID: sess.User.ActiveBusinessID,
		MemberRole: sess.User.BusinessRole,
		SessionID:  sess.ID,
		send:       make(chan []byte, sendBuffer),
		closed:     make(chan struct{}),
	}

	if sess.User.Role != nil {
		c.role = *sess.User.Role
	}

	c.guest = c.role == auth.RoleGuest

	h.mu.Lock()
	h.clients[c] = struct{}{}
	addTo(h.byUser, c.UserID, c)
	addTo(h.byRole, c.role, c)
	addTo(h.byBusiness, c.BusinessID, c)
	h.mu.Unlock()

	return c
}

// Leave removes a client. It is safe to call twice.
func (h *Hub) Leave(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.dropLocked(c)
}

// DisconnectUser closes every socket the user has open, at once. The 30 second
// recheck would drop them anyway; an erased account should not wait.
func (h *Hub) DisconnectUser(userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for c := range h.byUser[userID] {
		c.revoked.Store(true)
		c.removed.Store(true)
		h.dropLocked(c)
	}
}

// dropLocked forgets a client and closes it. A client already gone is ignored.
func (h *Hub) dropLocked(c *Client) {
	if _, ok := h.clients[c]; !ok {
		return
	}

	delete(h.clients, c)
	removeFrom(h.byUser, c.UserID, c)
	removeFrom(h.byRole, c.role, c)
	removeFrom(h.byBusiness, c.BusinessID, c)

	c.once.Do(func() { close(c.closed) })
}

func addTo(index map[string]map[*Client]struct{}, key string, c *Client) {
	if index[key] == nil {
		index[key] = map[*Client]struct{}{}
	}

	index[key][c] = struct{}{}
}

func removeFrom(index map[string]map[*Client]struct{}, key string, c *Client) {
	delete(index[key], c)

	if len(index[key]) == 0 {
		delete(index, key)
	}
}

// Reply sends one event to one client only (pong).
func (h *Hub) Reply(c *Client, ev Event) {
	data, _ := json.Marshal(ev)

	h.mu.Lock()
	defer h.mu.Unlock()

	h.pushLocked(c, data)
}

// broadcast sends one event to every client (resync).
func (h *Hub) broadcast(ev Event) {
	data, _ := json.Marshal(ev)

	h.mu.Lock()
	defer h.mu.Unlock()

	for c := range h.clients {
		h.pushLocked(c, data)
	}
}

// pushLocked never blocks. A client that cannot keep up is dropped, and its
// browser reconnects and refetches.
func (h *Hub) pushLocked(c *Client, data []byte) {
	select {
	case c.send <- data:
	default:
		h.dropLocked(c)
	}
}
