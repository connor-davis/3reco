## Scope Brief — 3REco marketplace + Go realtime backend rework

> **Goal:**
> `/goal Replace 3REco's Convex + Better Auth backend with a small Viper-style Go server (Go + Postgres + WebSocket live updates + Go-native auth, MinIO files, Resend email) and rebuild the React app as a Facebook-Marketplace-fidelity store marketplace in the existing 3REco green, keeping every current feature and migrating all live Convex data; done when one PR into master (with pr-evidence) shows every current feature working on the Go backend, live updates working, the data-move script tested, the user-picked design applied to every page, Convex removed, and all tests passing.`

### 1. Objective
3REco runs on a backend 3REco controls (Go + Postgres, Viper-style realtime) instead of
Convex, and looks and feels like a real marketplace (Facebook Marketplace / Amazon
fidelity): stores, listings, search, chat — in the current 3REco colour scheme.

### 2. In Scope
- New Go server in `server/`, modelled on Viper (`D:\Programming\Polyphron\viper`):
  Fiber + pgx + Postgres, live updates over WebSockets. Only 3REco's tables — not a
  general-purpose BaaS.
- Auth moved into Go: sign-up, sign-in, email verify, forgot/reset password, sessions,
  admin role. Better Auth removed.
- Every current feature kept and re-skinned: market, stores, cart, transaction requests +
  messages, collectors, collections, materials, stock, transactions (sales/purchases),
  invoices (PDF), CSV exports (incl. itemised mode), reviews/store reviews,
  notifications, dashboard, profile, admin users.
- Marketplace upgrade: store-centric browsing, browse/home grid, search + category
  filters, listing pages with galleries, seller storefronts, live chat with seller.
- Design phase: 10 distinct interactive HTML mockup sets, each covering **every page**
  (~20 pages × 10). Saved in `mystuff/` (added to `.gitignore`). UI/UX best practice,
  Facebook-level fidelity, 3REco green (`--primary: oklch(0.648 0.2 131.684)`), light + dark.
- One-time Convex → Postgres data-move script: users (existing passwords keep working),
  stores, materials, stock, transactions, invoices, files (Convex storage → MinIO).
- Docker compose (Viper-style): Go + Postgres + MinIO; Mailpit for local email.
- Work run the Viper AGENTS.md "Orchestrator V2" way: Opus orchestrates and reviews;
  Haiku 5.5 / GPT 6 Luna map; Sonnet 5.5 / GPT 6.1 Sol build; round-robin providers;
  sub-agents at medium effort or lower.

### 3. Out of Scope (explicit non-goals)
- Running Viper itself, or copying Viper's admin dashboard, MCP, workflows, plugins or
  multi-project features.
- New business features beyond the marketplace shell above (no payments/checkout
  provider, no delivery tracking, no recommendation engine).
- Changing the brand colours.
- Merging the PR — the owner merges when happy.

### 4. Deliverables
| Artifact | Format / location | Notes |
|----------|-------------------|-------|
| Design mockups ×10 | `mystuff/designs/01..10/` interactive HTML, every page | gitignored; shown via preview for the pick |
| Go backend | `server/` (cmd, internal, migrations) | REST + WebSocket live queries |
| Postgres schema | SQL migrations in `server/` | mirrors `convex/schema.ts` tables |
| Go auth | `server/internal/auth` | sessions, verify, reset, admin; Resend email |
| Data-move script | `server/cmd/migrate-convex` (or similar) | Convex export → Postgres + MinIO; tested on a copy |
| Frontend rebuild | `src/` | TanStack Router kept; Convex client swapped for Go client + live hook |
| Docker setup | `docker-compose.yml`, updated `Dockerfile` | Go + Postgres + MinIO + Mailpit |
| Plan | `project/plans/` via product-ops implementation-planning | built from this brief |
| PR into master | branch off master, pr-evidence body | mermaid diagram + screenshots of every changed page |

### 5. Constraints
- Better Auth stores scrypt password hashes; the Go auth must verify them
  (`golang.org/x/crypto/scrypt`) so migrated users log in with the same password.
- Keep the existing React 19 + Vite + TanStack Router + Tailwind 4 + shadcn stack.
- Live updates must cover what Convex subscriptions do today (market lists, messages,
  notifications, cart, stock).
- Backend work starts straight away; **frontend rebuild waits for the owner's design pick.**
- Accessibility basics + both themes (light/dark) on every page.

### 6. Success Criteria (Definition of Done)
- [ ] 10 mockup sets × every page exist in `mystuff/designs/`, and the owner picked one
- [ ] Go server runs via docker compose; every current feature works against it
- [ ] Live updates: a change in one browser shows in another without refresh
- [ ] Go auth: sign-up, verify, sign-in, reset, admin gate all work; migrated user logs in with old password
- [ ] Data-move script run against a Convex export copy; record counts match
- [ ] Picked design applied to every page, light + dark
- [ ] `convex/`, Convex and Better Auth packages removed
- [ ] Go tests + frontend build/lint pass
- [ ] One PR into master with a pr-evidence body (diagram + screenshots); not merged

### 7. Audience / Context
3REco users: businesses and collectors buying/selling recycled materials, plus admins.
Surface: the whole 3REco web app (`D:\Programming\Use-IT\3reco\3reco`).

### 8. Open Assumptions
- Live updates use Postgres LISTEN/NOTIFY → WebSocket fan-out, like Viper. Veto if you want otherwise.
- Resend stays the email sender in prod.
- Category list for marketplace filters comes from existing material types.

### 9. Confidence (final)
| Area | Score |
|------|-------|
| Objective | 90 |
| Boundaries | 88 |
| Deliverables | 90 |
| Constraints | 85 |
| Success | 90 |
| Audience | 92 |

### 10. User notes captured during scoping
- Order: "Both at once but use vipers orchestrator logic and design me 10 different designs, ensuring that you keep to best practices in terms of UI/UX design, ensuring we have the fidelity of facebook"
- Features: "Well we want it to be like a marketplace right so we technically wanna have stores etc"
- Designs: "10 HTML interactive mockups of every page, make a .gitignore mystuff folder"
- Location: "This repo, on a new branch with a PR into the main branch so I can get you to merge when I am happy, also use pr-evidence please"
