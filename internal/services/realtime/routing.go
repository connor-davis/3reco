package realtime

import (
	"encoding/json"

	"github.com/connor-davis/3reco/internal/services/auth"
)

// The audience words a trigger may send besides user ids.
const (
	audAll   = "all"   // every signed-in user
	audStaff = "staff" // admins and staff
	audAdmin = "admin" // admins only
)

// change is one NOTIFY payload: what changed and who may hear about it. It
// never holds row data.
type change struct {
	Kind  string   `json:"kind"`
	ID    string   `json:"id"`
	Op    string   `json:"op"`
	Users []string `json:"users"`
	Aud   string   `json:"aud"`
}

// route tells every open socket of every recipient. The event is encoded
// once, and a socket that is a recipient twice (a party who is also an admin)
// still hears it once.
func (h *Hub) route(ch change) {
	data, _ := json.Marshal(Event{Type: "changed", Kind: ch.Kind, ID: ch.ID})

	h.mu.Lock()
	defer h.mu.Unlock()

	heard := map[*Client]struct{}{}

	// A guest hears only what is sent to their own id, never a group.
	push := func(set map[*Client]struct{}, named bool) {
		for c := range set {
			if _, ok := heard[c]; ok || (c.guest && !named) {
				continue
			}

			heard[c] = struct{}{}

			h.pushLocked(c, data)
		}
	}

	for _, id := range ch.Users {
		push(h.byUser[id], true)
	}

	switch ch.Aud {
	case audAll:
		push(h.clients, false)
	case audStaff:
		push(h.byRole[auth.RoleAdmin], false)
		push(h.byRole[auth.RoleStaff], false)
	case audAdmin:
		push(h.byRole[auth.RoleAdmin], false)
	}
}
