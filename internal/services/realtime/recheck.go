package realtime

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/services/auth"
)

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

// Recheck drops every socket whose session ended or whose user is removed or
// back to guest, and refreshes the role of the rest, so a demoted admin stops
// hearing admin events. The loop runs it every recheckEvery; tests call it.
func (h *Hub) Recheck(ctx context.Context) {
	h.mu.Lock()

	all := make([]*Client, 0, len(h.clients))
	sessionIDs := make([]string, 0, len(h.clients))

	for c := range h.clients {
		all = append(all, c)
		sessionIDs = append(sessionIDs, c.SessionID)
	}

	h.mu.Unlock()

	if len(all) == 0 {
		return
	}

	live, err := h.liveSessions(ctx, sessionIDs)
	if err != nil {
		// ponytail: a database hiccup drops every socket; browsers reconnect,
		// so it only costs one refetch each.
		live = nil
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for _, c := range all {
		role, ok := live[c.SessionID]
		if !ok || role == auth.RoleGuest {
			h.dropLocked(c)

			continue
		}

		if _, here := h.clients[c]; here && role != c.role {
			removeFrom(h.byRole, c.role, c)
			c.role = role
			addTo(h.byRole, role, c)
		}
	}
}

// liveSessions maps each of the session ids that are unexpired and belong to
// a user who has not been removed to that user's current role.
func (h *Hub) liveSessions(ctx context.Context, ids []string) (map[string]string, error) {
	rows, err := h.db.Pool.Query(ctx, `
		SELECT s.id, u.role FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.id = ANY($1) AND s.expires_at > now() AND NOT u.is_removed`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	live := map[string]string{}

	for rows.Next() {
		var id, role string
		if err := rows.Scan(&id, &role); err != nil {
			return nil, err
		}

		live[id] = role
	}

	return live, rows.Err()
}
