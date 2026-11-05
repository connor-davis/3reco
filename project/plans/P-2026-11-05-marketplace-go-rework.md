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
| T5 | (picked 2026-11-05, changed same day) Base look 05-clean-minimal with a fixed, non-collapsible sidebar; chat/deal room from 10; borrow from 04, 06, 09; phone layout from 08. Build one final design as a Vite + TanStack + shadcn app in `mystuff/final-design`, audited for full shadcn use. T13 follows it. | owner, then dev + audit | T4 |
| T6 | (done c4f027e) Go skeleton: module, config, Postgres pool, SQL migrations for every table, docker compose (Postgres, MinIO, Mailpit) | dev | T1 |
| T7 | (done c4f027e) Go auth: sign-up, verify email, sign-in, sessions (cookie), forgot/reset, admin role; scrypt verify of Better Auth hashes | dev | T6 |
| T8 | (done, merged 8d37ac3) Go domain API: every Convex query/mutation/action as REST, same access rules | dev(s), split by domain | T6, T7 |
| T9 | (done c4f027e) Realtime: LISTEN/NOTIFY → WebSocket hub, subscribe-by-topic; matches Convex live queries | dev | T6 |
| T10 | (done a447d22) Files (MinIO) + PDFs/CSV exports + emails (Resend/Mailpit) | dev | T8 |
| T11 | (done fdce044, 9d983e8; dry run on the real export loaded every row) Data move: Convex export → Postgres + MinIO, count check | dev | T6, T10 |
| T11b | Stock holds (Viper-style): hold stock while an offer is open, release on decline/withdraw/cancel/expiry; map `mystuff/maps/holds-privacy-map.md` | done (4fa380e): 48h hold at offer, expiry loop, direct sale and stock edits respect holds | T8 |
| T11c | POPIA + GDPR: every technical control (consent, notices, access/export, correction, erasure as anonymise where tax law needs the record, retention, audit log, security, breach support); owner paperwork listed separately | done (a517b8b, d708414, 6759e86): field encryption, export, self-delete, retention, notice version, audit log. Open: re-key command; web sign-up must send accepted_terms_version (T13). Owner paperwork still open | T8, T10 |
| T12 | Frontend client: fetch client + `useLive` + auth context; swap all Convex calls | done (25f8fbd Phase 0; public /api/stats). Backend perf pass eff2a50 (0008 indexes, market 867→1.7 ms) | T8, T9 |
| T13 | Frontend rebuild in picked design, every page, light + dark | done (chunks A bfa275c, B 51fe86b, C 2d8b49e, D 921ba9e; mock removed 7572e38). Sign-up sends accepted_terms_version | T5, T12 |
| T14 | Remove `convex/`, Convex + Better Auth packages; update compose/Dockerfile/README | done (01e8dd5; Go serves dist). Root compose and deploy.sh not run yet | T13 |
| T15 | Verify: Go tests, build, lint, two-browser live check, migration dry run | audit 1: FAIL on 6 should-fix, 0 blockers (mystuff/maps/final-audit.md); fixes in progress | T14 |
| T16 | PR into master with pr-evidence; owner merges | Orchestrator | T15 |

## T12-T14 decisions (orchestrator, 2026-11-05, under the owner's "finish it off" goal)

Map: `mystuff/maps/t12-t14-web-map.md` section 6.

- D1 Price tiers: dropped. One price per stock line, as the API has. No min lot.
- D2 Store online/verified/hours/contact/map coords: removed from the UI. Map view goes (no coords); list only.
- D3 Community and impact numbers: one public `GET /api/stats` (completed-trade kg, CO2 from material carbon factors, deal count, top stores by kg) built in Phase 0.
- D4 Auth routes lose the `/auth` prefix: `/sign-in`, `/sign-up`, `/verify-email`, `/reset-password`, `/forgot-password` (match the email links).
- D5 Statuses follow the API: pending, offered, accepted, rejected, cancelled. No Counter.
- D6 Profile gets a "Your data" tab (download, delete account, notice); transaction detail gets receipt upload.
- D7 The Go binary serves `web/apps/app/dist` (SPA fallback, gzip, long cache on hashed assets). One container. Built in T14.
- D8 No self-serve collector role change; collector link is by profile phone, role set by admin.
- D9 Preview pill and page-state switcher removed from the real app.
- npm is the package manager; root `prettier.config.js` applies.
