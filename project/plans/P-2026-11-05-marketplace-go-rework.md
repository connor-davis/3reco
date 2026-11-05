---
id: P-2026-11-05-marketplace-go-rework
created_by: Orchestrator (Claude Opus 5.5) with Connor Davis
scope_brief: project/scope-briefs/3reco-marketplace-go-rework.md
branch: cd/feat-marketplace-go
status: in-progress
---

# Plan — 3REco marketplace + Go realtime backend

> `/goal Replace 3REco's Convex + Better Auth backend with a small Viper-style Go server (Go + Postgres + WebSocket live updates + Go-native auth, MinIO files, Resend email) and rebuild the React app as a Facebook-Marketplace-fidelity store marketplace in the existing 3REco green, keeping every current feature and migrating all live Convex data; done when one PR into master (with pr-evidence) shows every current feature working on the Go backend, live updates working, the data-move script tested, the user-picked design applied to every page, Convex removed, and all tests passing.`

## Layout (owner, 2026-11-05: overhaul the repo root the Viper way)

The whole repo root becomes a Viper-style Go repo. Source of truth: root `AGENTS.md`.

- `go.mod` at root, module `github.com/connor-davis/3reco`.
- `cmd/3reco`, `internal/{api,services,stores,platform}`, `tests`, `deployments`,
  `docs`, `scripts`, `Taskfile.yml`.
- `3reco/` moves to `web/apps/app`; `3reco/documentation` moves to `web/apps/docs`.
- `mystuff/` at root, gitignored: `maps/`, `designs/01..10/`.
- Legacy `api/` (Express) and `app/` (first 3REco) moved to `reference/api` and
  `reference/app` as reference material. Never delete or change them (owner, 2026-11-05).
- Root `AGENTS.md` (from Viper, rewritten) and `docs/style-guide.md` added. No root
  `CLAUDE.md` (owner); the old Convex `3reco/CLAUDE.md` goes with Convex in T14. Ports: API 8180, Postgres 5441, Mailpit 8026, MinIO 9010.

## Decisions taken in planning (Orchestrator)

- Passwords: argon2id for new hashes; migrated Better Auth scrypt hashes
  (`saltHex:keyHex`, N=16384 r=16 p=1 dkLen=64, salt = hex string bytes) verify, then
  rehash to argon2id on the first good sign-in.
- IDs: text primary keys. Migrated rows keep their Convex `_id`, so invoice numbers
  (last 8 chars of the id) and links stay the same.
- Invoice PDFs: a small pure-Go PDF library, not Viper's headless Chromium.
- Realtime sends invalidation events only (`changed` + topic + id); clients refetch
  through the authorised REST routes, so no row data ever travels on the socket.
- The security holes in backend-map section 13 are fixed in the rewrite, each with a
  leak test, not copied.
- Design set: the 21 current pages plus Listing detail, Cart and Messages inbox
  (brief: `mystuff/designs/BRIEF.md`).
- Brand colour is the logo green `oklch(0.648 0.2 131.684)` (owner, 2026-11-05). The
  teal override (`hsl(183, 55%, 35%)`) at the end of today's `index.css` and on the
  invoice header is dropped in the rebuild.
- `web/apps/docs` content still describes Convex setup; rewritten in T14.
- T8 notes: a collector login links to its collector row by phone (no direct link in
  Convex); recheck in T11. Inbox shows pending requests only. Exports skipped and
  invoice/receipt routes return 501 until T10.
- The 11 old web lint errors (`react-refresh/only-export-components` in `components/ui`)
  are fixed when the web app is rewired in T12/T13, not by loosening the rule.

## Roles (Viper AGENTS.md, Orchestrator V2)

Orchestrator Opus 5.5 plans, reviews, commits, writes docs. Mappers: Haiku 5.5 / GPT 6 Luna.
Developers/designers: Sonnet 5.5 / GPT 6.1 Sol, round-robin. All children medium effort or lower.

## Tasks

| # | Task | Owner | Depends on |
|---|------|-------|-----------|
| T1 | Map Convex backend → `mystuff/maps/backend-map.md` (every table, index, function, auth rule, subscription, file, email, aggregate, migration) | mapper (Haiku) | — |
| T2 | Map frontend → `mystuff/maps/pages-map.md` (every route, data shown, actions, states, roles) | mapper (Luna) | — |
| T2b | (done) Restructure root: move `3reco/` → `web/apps/app`, docs → `web/apps/docs`, `api/` `app/` already in `reference/` (done), move `mystuff/` to root, fix compose/Dockerfile paths | Orchestrator | T1, T2 |
| T3 | Design system brief for mockups: tokens from `3reco/src/index.css`, shared rules | Orchestrator | T2 |
| T4 | 10 interactive HTML mockup sets × every page → `mystuff/designs/NN/` | 10 designers, alternating | T3 |
| T5 | (picked 2026-11-05) Base 10-chat-commerce; borrow UI from 04, 05, 06, 09; phone layout from 08. Build one final design as a Vite + TanStack + shadcn app in `mystuff/final-design`, audited for full shadcn use. T13 follows it. | owner, then dev + audit | T4 |
| T6 | (done c4f027e) Go skeleton: module, config, Postgres pool, SQL migrations for every table, docker compose (Postgres, MinIO, Mailpit) | dev | T1 |
| T7 | (done c4f027e) Go auth: sign-up, verify email, sign-in, sessions (cookie), forgot/reset, admin role; scrypt verify of Better Auth hashes | dev | T6 |
| T8 | (done, merged 8d37ac3) Go domain API: every Convex query/mutation/action as REST, same access rules | dev(s), split by domain | T6, T7 |
| T9 | (done c4f027e) Realtime: LISTEN/NOTIFY → WebSocket hub, subscribe-by-topic; matches Convex live queries | dev | T6 |
| T10 | Files (MinIO) + PDFs/CSV exports + emails (Resend/Mailpit) | dev | T8 |
| T11 | Data move: Convex export → Postgres + MinIO, count check | dev | T6, T10 |
| T12 | Frontend client: fetch client + `useLive` + auth context; swap all Convex calls | dev | T8, T9 |
| T13 | Frontend rebuild in picked design, every page, light + dark | dev(s) | T5, T12 |
| T14 | Remove `convex/`, Convex + Better Auth packages; update compose/Dockerfile/README | dev | T13 |
| T15 | Verify: Go tests, build, lint, two-browser live check, migration dry run | Orchestrator + qa | T14 |
| T16 | PR into master with pr-evidence; owner merges | Orchestrator | T15 |
