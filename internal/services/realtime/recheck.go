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
	h.recheck(ctx, "")
}

// RecheckUser is Recheck for one person's sockets only, so a role change shows
// at once instead of at the next loop. Call it after the change commits.
func (h *Hub) RecheckUser(ctx context.Context, userID string) {
	h.recheck(ctx, userID)
}

// recheck covers every client, or only userID's when it is not empty.
func (h *Hub) recheck(ctx context.Context, userID string) {
	h.mu.Lock()

	all := make([]*Client, 0, len(h.clients))
	sessionIDs := make([]string, 0, len(h.clients))

	for c := range h.clients {
		if userID != "" && c.UserID != userID {
			continue
		}

		all = append(all, c)
		sessionIDs = append(sessionIDs, c.SessionID)
	}

	h.mu.Unlock()

	if len(all) == 0 {
		return
	}

	live, err := h.liveSessions(ctx, sessionIDs)
	failed := err != nil

	if failed {
		// ponytail: a database hiccup drops every socket; browsers reconnect,
		// so it only costs one refetch each.
		live = nil
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for _, c := range all {
		if _, here := h.clients[c]; !here {
			continue
		}

		session, ok := live[c.SessionID]
		role := session.role

		// A guest may hold a socket to hear their role change; only someone who
		// was not a guest when they joined is dropped for becoming one.
		missingMember := session.business != "" && session.member == ""
		if !ok || missingMember || (role == auth.RoleGuest && !c.guest) {
			// A failed lookup is not proof: those browsers just reconnect.
			c.revoked.Store(!failed)
			h.dropLocked(c)

			continue
		}

		if role != c.role {
			removeFrom(h.byRole, c.role, c)
			c.role = role
			addTo(h.byRole, role, c)
		}

		// Setup can select the first business on an existing personal session.
		// Keep that sign-in, move its routing index, and ask the app to refetch.
		if session.business != c.BusinessID || session.member != c.MemberRole {
			removeFrom(h.byBusiness, c.BusinessID, c)
			c.BusinessID = session.business
			addTo(h.byBusiness, c.BusinessID, c)
			h.pushLocked(c, []byte(`{"type":"resync"}`))
		}

		c.MemberRole = session.member
		c.guest = role == auth.RoleGuest
	}
}

// liveSessions maps each of the session ids that are unexpired and belong to
// a user who has not been removed to that user's current role.
func (h *Hub) liveSessions(ctx context.Context, ids []string) (map[string]liveSession, error) {
	rows, err := h.db.Pool.Query(ctx, `
		SELECT s.id, u.role, COALESCE(s.active_business_id,''), COALESCE(m.role,'')
		FROM sessions s JOIN users u ON u.id = s.user_id
		LEFT JOIN business_members m ON m.business_id=s.active_business_id AND m.user_id=s.user_id
		WHERE s.id = ANY($1) AND s.expires_at > now() AND NOT u.is_removed`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	live := map[string]liveSession{}

	for rows.Next() {
		var id string
		var session liveSession
		if err := rows.Scan(&id, &session.role, &session.business, &session.member); err != nil {
			return nil, err
		}

		live[id] = session
	}

	return live, rows.Err()
}

type liveSession struct {
	role, business, member string
}
