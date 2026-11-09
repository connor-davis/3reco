# 3REco

3REco is a marketplace for recyclable materials. Businesses and collectors
open stores, list materials, chat, trade and invoice each other. It is a Go
backend (data, access checks, auth, files, realtime, email) plus a React web
app.

## What belongs in 3REco

- Marketplace and back-office features for 3REco's users: stores, listings,
  requests, chat, transactions, stock, collections, invoices, exports, reviews,
  notifications and admin.
- One backend, built only for 3REco. It borrows its patterns from Viper
  (`D:\Programming\Polyphron\viper`) but is not a general backend: no
  user-defined tables, workflows, plugins or MCP.
- Every route checks who is calling and what they own, and has a test that
  tries to read or change someone else's data.
- Live data goes over the WebSocket hub, never through polling.

## Layout

- `cmd/3reco` - the binary: `serve`, `migrate`, `admin create`,
  `import-convex` (the one-time move off Convex), `version`.
- `internal/api` - Fiber v3 route registration, with handlers in
  `<area>/` (auth, market, stores, requests, transactions, stock,
  collections, invoices, exports, reviews, notifications, admin, files,
  sockets). It holds no SQL; statements live in stores.
- `internal/services/<area>` - business logic and rules (stock, the request
  and transaction state machine, prices, invoice numbers). `auth` owns
  sign-up, sessions, email checks and password reset; `realtime` owns the
  LISTEN/NOTIFY to WebSocket hub.
- `internal/stores/<area>` - database access with pgx, one store per area.
- `internal/platform` - shared pieces: `config`, `database` (pool and
  embedded SQL migrations), `mail` (Resend, Mailpit locally), `storage`
  (MinIO / S3), `pdf`, `apperr`.
- `web/apps/app` - the React app (React 19, Vite, TanStack Router,
  Tailwind 4, shadcn). It talks to the API through `src/lib/api` and gets live
  data from the `useLiveEvents` hook. The Go binary serves its `dist/` folder.
- `web/apps/docs` - the documentation site.
- `deployments` - `Dockerfile` (Go binary plus the built web app, one
  container) and `docker-compose.yml` (local Postgres, MinIO, Mailpit). The
  root `docker-compose.yml` and `deploy.sh` are the production stack.
- `tests` - Go API tests against a real Postgres (`tests/testutil` has the
  helpers).
- `docs` - [start here](docs/start-here.md), [code map](docs/code-map.md),
  [style guide](docs/style-guide.md), [operate](docs/operate.md).
- `reference/api`, `reference/app` - the first 3REco (Express and its app).
  Reference only.
- `project` - scope briefs, plans, decisions and delivery records.
  `mystuff` - local notes, maps and design mockups, untracked.

## Code map

The owner lists (which file owns which job) live in
[docs/code-map.md](docs/code-map.md). Read it before writing a new helper,
and add a line there when you add an owner.

## Commands

All commands run through [Task](https://taskfile.dev); `task` lists them.

- `task up` - start Postgres (localhost:5441, threereco/threereco), Mailpit
  (http://localhost:8026) and MinIO (localhost:9010). Run
  `podman machine start` first (docker works too). The ports sit next to
  Viper's so both can run at once.
- `task dev` - API on :8180 plus the Vite dev server.
- `task migrate` - run the SQL migrations.
- `task test` - Go tests against the real services. It sets
  `THREERECO_REQUIRE_SERVICES=1`, so a missing service fails instead of
  skipping; a plain `go test` still skips, so its green run proves nothing.
  `THREERECO_TEST_DATABASE_URL` defaults to
  `postgres://threereco:threereco@localhost:5441/threereco?sslmode=disable`.
- `task check` - gofmt, vet, staticcheck, Go tests, web typecheck, lint, tests and
  build. Run it before every PR.
- `task import-convex -- <export.zip>` - the one-time move off Convex: load a
  `npx convex export` file into Postgres and MinIO, then print record counts per
  table.
- Other tasks: `install`, `fmt`, `build`, `serve`, `dev:api`, `dev:web`,
  `down`, `nuke` (delete all local data).

## Code style

The rules are in [docs/style-guide.md](docs/style-guide.md). In short:

- Blank lines between steps. Comments say why, in plain words.
- Go: a doc comment on every exported name; a call goes on one line if it
  fits in 100 characters, otherwise one argument per line.
- No file over 900 lines. Split a long file by job; never squeeze lines to
  fit.
- TypeScript is formatted by Prettier (root `prettier.config.js`) and
  linted by ESLint. Both must pass with no changes left.
- UI: match the file around you, and reuse the shared components before
  making new ones. Plain words on screen.
- UI design: the picked marketplace design lives in `mystuff/designs/`
  (local, untracked). Read it before any page work. The brand green is
  `--primary: oklch(0.648 0.2 131.684)`; every page works in light and dark.

## Work rules

- Branches are `<initials>/<type>-<slug>` off `master` (for example
  `cd/feat-marketplace-go`). Every change lands through a PR into `master`
  with a pr-evidence body (`/pr-evidence:pr-evidence`). The owner
  merges; agents never merge unless told to.
- Stay local: no cloud accounts in development. Use MinIO for files and
  Mailpit for email.
- `reference/api/` (Express) and `reference/app/` are the first 3REco. They are reference
  material: read them for old business rules, but never change, build or
  delete them.

## Agent roles (Orchestrator V2)

T3 Code runs Orchestrator V2: `delegate_task` starts a sub-agent on any
provider and model (`orchestrator_capabilities` lists them). Work this way
for every task with more than a small edit.

- **Orchestrator - Opus 5.5.** Reviews what comes back and moves the work
  to its next step. It hands out tasks, checks each map and diff, and writes
  the documents (plans, decisions, PR bodies). It does not write product
  code.
- **Developer - Sonnet 5.5 (`claude-sonnet-5-5`) or GPT 6.1 Sol
  (`gpt-6.1-sol`).** Writes the code and its tests and runs them. It always
  starts from a mapper's map that covers 100% of the task. It never starts a
  mapper or any other sub-agent; if the map is short, it stops and tells the
  Orchestrator what is missing.
- **Repo mapper - Haiku 5.5 (`claude-haiku-5-5`) or GPT 6 Luna
  (`gpt-6-luna`).** Maps everything the task touches, so the Developer needs
  no search of its own: every file and owner involved (from
  docs/code-map.md), the call paths, the tests that cover them and the rules
  that apply. A mapper may start more mappers to split a big map, but only
  Haiku 5.5 or GPT 6 Luna. It writes maps to `mystuff/maps/` only.

Every sub-agent runs at **medium effort or lower**. Set it on each
`delegate_task` call: some models default higher (Sonnet 5.5 defaults to
high).

Balance the work between Claude and GPT models. Take turns, round robin: if
the last mapper was Haiku 5.5, the next one is GPT 6 Luna, and the same for
Developers (Sonnet 5.5, then GPT 6.1 Sol). When two tasks run side by side,
give one to each provider. Skip a provider only when it is unavailable, and
say so.

How they work together:

1. The Orchestrator sends a mapper the task.
2. The Orchestrator checks the map covers the whole task: every file the
   change touches, its owner and its tests. If not, it sends a mapper a
   narrower question.
3. The Orchestrator gives the Developer the task with the full map.
4. The Orchestrator reviews the Developer's diff and test output, then
   commits or sends it back, and moves to the next task.

If a running sub-agent goes the wrong way, steer it with a message
(`t3_thread_send` to its thread). Don't cancel it and start over.

## Learnings

Add short notes here when something surprises you, under the closest group.

### Windows and tooling

- On Windows, Python can't read git-bash `/tmp` paths. Keep scratch files
  inside the repo (for example `mystuff/`) and use relative paths.
- Python on Windows writes CRLF with `open(p, 'w')`. Pass `newline=''` on
  both read and write when a script edits repo files.
- Bash heredocs break long scripts: quoting goes wrong, and a double
  backslash comes out as one. Write the file or make the edit with the
  editor tool instead.
- A script that walks the repo must use `git ls-files`, never the whole
  folder. `mystuff/` holds the user's own notes and mockups.
- A Windows Go test can fail to start with `0xc0000142`. Retry with
  `GOFLAGS=-p=1` so packages run one at a time.
- Task ignores `dir:` on a single `cmd:` entry, so the command runs from
  the repo root. Write `cd web/apps/app && ...` instead.
- In `checker | tail && gh pr create`, the pipe hides the checker's
  failure. Never pipe the checker; send its output to a file.
- The live server is `root@3reco` over Tailscale. Use PowerShell's `ssh`:
  Git Bash's `ssh` has no key for it. Live Convex is self-hosted there
  (container `3reco-convex-backend-1`, port 3210 on localhost only). To
  export, make a key with `./generate_admin_key.sh` in that container,
  tunnel the port, then run `npx convex export` with
  `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` set.

### Go, Postgres and the API

- Postgres 18 makes generated columns VIRTUAL unless told otherwise. Say
  `STORED` so a computed field can be indexed.
- `current_setting('x', true)` is NULL when x was never set, and
  `NOT (a AND NULL)` is NULL, so an `IF` quietly skips. Wrap it in
  `COALESCE(..., '')`.
- Nullable columns scan into `sql.NullString` or a pointer, not `string`.
- `text_array || 'word'` reads the word as an array literal and fails. Use
  `array_append(arr, 'word')`.
- Migrations are keyed by the whole file name and run in name order. Never
  rename a merged one, or databases that ran it run it again.
- A `fiber.Ctx` is also a `context.Context`, so passing `c` where a helper
  wants `ctx` compiles but reads the wrong values. Pass `c.Context()`.
- Remove files after a delete only after the commit; a rolled-back
  transaction must keep its files.
- Money and quantities are exact: `numeric` in Postgres, strings or integer
  cents on the wire, never float.

### Tests

- A WebSocket read that times out kills the connection for good. In a
  realtime test, wait for the event you want first, then check silence.
- Match JSON keys, not substrings: a random id can hold the word you search
  for.

### Web app and e2e

- A `type="number"` input rounds and localises decimals ("19,99"). Exact
  decimals use a text input with `inputMode="decimal"`.
- Playwright's `getByLabel("URL")` matches any label holding "url", in any
  case. Pass `exact: true`.
- Test emails can hold a `+`. Don't build a RegExp from one.
