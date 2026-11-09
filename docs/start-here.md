# Start here

3REco is a marketplace for recyclable materials. A Go server keeps the data and
checks who may see what. A React app is the screen.

## Read in this order

1. [AGENTS.md](../AGENTS.md): what belongs in 3REco, and the work rules.
2. [code-map.md](code-map.md): which file owns which job.
3. [style-guide.md](style-guide.md): how code is written here.
4. [operate.md](operate.md): settings, ports and backups.

## Three commands

Start Podman first (`podman machine start`). Then:

```
task up      # Postgres, Mailpit and MinIO
task dev     # the API on :8180 and the web app
task check   # run before every PR
```

`task` on its own lists every command.

## Where things are

| Folder | What is in it |
| --- | --- |
| `cmd/3reco` | the program: `serve`, `migrate`, `admin create`, `health`, `version` |
| `internal/api` | HTTP routes. No SQL here |
| `internal/services` | the rules: auth, realtime, and later stock and requests |
| `internal/stores` | SQL, one store per area |
| `internal/platform` | settings, database, mail, files, errors |
| `tests` | Go tests against a real Postgres |
| `web/apps/app` | the React app |
| `web/apps/docs` | the docs site |
| `deployments` | `Dockerfile` and `docker-compose.yml` |
| `reference` | the first 3REco. Read only |
| `project` | plans, decisions and delivery records |

## Local addresses

| What | Address |
| --- | --- |
| API | http://localhost:8180 |
| Web app | http://localhost:5173 |
| Mailpit inbox | http://localhost:8026 |
| MinIO console | http://localhost:9011 |
| Postgres | `localhost:5441`, user and password `threereco` |

## Make your first admin

```
go run ./cmd/3reco admin create --email you@example.com --password "a long password" --name You
```

Then sign in with that email. Sign-up emails land in Mailpit.
