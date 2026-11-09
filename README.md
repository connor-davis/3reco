# 3REco

A marketplace for recyclable materials. Businesses and collectors open stores,
list materials, chat, trade and invoice each other.

It is a Go backend (data, access checks, auth, files, realtime, email) plus a
React web app. The Go binary serves both: the API under `/api` and the built web
app everywhere else.

## Run it locally

You need Go, Node 22, [Task](https://taskfile.dev) and Podman (or Docker).

```
podman machine start   # Windows and Mac, if it is not running
task up                # Postgres, Mailpit (fake email) and MinIO (files)
task install           # web app packages
task dev               # API on :8180, web app on http://localhost:5173
```

Mail shows up in Mailpit at http://localhost:8026. `task` lists every command;
`task check` runs formatting, vet, staticcheck, the Go tests and the web checks.

## Layout

- `cmd/3reco` - the binary: `serve`, `migrate`, `admin create`, `import-convex`, `version`.
- `internal` - the API, services, database stores and shared platform code.
- `web/apps/app` - the React app. `web/apps/docs` - the documentation site.
- `deployments` - the `Dockerfile` (Go binary plus built web app) and the local services.
- `tests` - Go API tests against a real Postgres.
- `docs` - [start here](docs/start-here.md), [code map](docs/code-map.md),
  [style guide](docs/style-guide.md), [operate](docs/operate.md).
- `reference` - the first 3REco (Express). Read only.

## Deploy

```
RESEND_API_KEY=... AUTH_FROM_EMAIL=... ./deploy.sh yourdomain.com
```

`deploy.sh` writes `.env` (making the database, file store and encryption
secrets) and runs `docker compose up -d --build`. Put a proxy with HTTPS in front:
`app.<domain>` to `127.0.0.1:8180`, `docs.<domain>` to `127.0.0.1:3001`. Settings
and backups are in [docs/operate.md](docs/operate.md).

Moving the first 3REco's data over from Convex is a one-time job:
`task import-convex -- export.zip` (see the same file).
