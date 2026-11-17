# Operate

How to run 3REco and what to look after.

## Settings

Every setting is an environment variable. The list below is built from
`internal/platform/config/config.go` (`EnvVars`); keep the two in step.

| Variable | Default | What it does |
| --- | --- | --- |
| `THREERECO_ADDR` | `:8180` | Address the API listens on. |
| `THREERECO_DATABASE_URL` | `postgres://threereco:threereco@localhost:5441/threereco?sslmode=disable` | Postgres connection string. |
| `THREERECO_WEB_ORIGIN` | `http://localhost:5173` | Origin of the web app. Used for CORS, CSRF, WebSockets and email links. |
| `THREERECO_WEB_DIST` | `web/apps/app/dist` | Folder with the built web app. The server serves it next to `/api`; if it is missing, only the API runs. See [Web app](#web-app). |
| `THREERECO_DEV` | `false` | Dev mode: coloured logs, and mail goes to Mailpit when no Resend key is set. |
| `THREERECO_DEMO` | `false` | Demo site: dummy data, a banner, no real email, no sign-up, no exports. Refused unless the database name ends in `_demo` and the bucket name has `demo` in it. See [Demo site](#demo-site). |
| `THREERECO_COOKIE_SECURE` | `false` | Set true in production so session cookies are HTTPS only. |
| `THREERECO_TRUSTED_PROXIES` | (empty) | Comma-separated proxy addresses whose X-Forwarded-For is believed. |
| `THREERECO_FIELD_KEY` | (none, **required**) | Base64 of 32 random bytes. Encrypts ID numbers, bank account numbers and e-wallet ids. The server will not start without it. See [Field key](#field-key). |
| `THREERECO_AUTH_RATE_LIMIT` | `20` | Requests per minute, per address, on each auth route. |
| `THREERECO_DB_MAX_CONNS` | `25` | Largest Postgres pool. |
| `THREERECO_SHUTDOWN_TIMEOUT` | `15s` | How long to wait for requests to finish on stop. |
| `THREERECO_BODY_LIMIT` | `10485760` | Largest request body in bytes. |
| `THREERECO_SMTP_HOST` | (empty) | SMTP host (Mailpit locally). Empty means no SMTP unless dev. |
| `THREERECO_SMTP_PORT` | `1026` | SMTP port. |
| `RESEND_API_KEY` | (empty) | Resend API key. When set, mail goes through Resend. |
| `THREERECO_RESEND_URL` | `https://api.resend.com` | Resend API base URL (tests point it at a fake). |
| `AUTH_FROM_EMAIL` | `3rEco <no-reply@localhost>` | The From address on every email. |
| `THREERECO_S3_ENDPOINT` | `localhost:9010` | MinIO or S3 host and port, with no scheme. |
| `THREERECO_S3_BUCKET` | `threereco` | Bucket for uploaded files. |
| `THREERECO_S3_ACCESS_KEY` | `threereco` | S3 access key. |
| `THREERECO_S3_SECRET_KEY` | `threereco-secret` | S3 secret key. |
| `THREERECO_S3_REGION` | `us-east-1` | S3 region. |
| `THREERECO_S3_TLS` | `false` | Use HTTPS to reach S3. |
| `THREERECO_GEOCODER` | _(empty)_ | Map service that places business addresses for the distance filter. Empty is the offline fake in dev and off in production (the filter is hidden); `fake` forces the fake; `off` turns the filter off. |
| `THREERECO_VAPID_PUBLIC_KEY` | (empty) | Public VAPID key for phone alerts (web push). Phone alerts are off unless both keys are set. See [Phone alerts](#phone-alerts). |
| `THREERECO_VAPID_PRIVATE_KEY` | (empty) | Private VAPID key for phone alerts. A secret: keep it out of git. |
| `THREERECO_VAPID_SUBJECT` | `mailto:admin@localhost` | Contact the push services can reach, as a `mailto:` or `https:` address. |

## Demo site

`demo.3reco.co.za` runs the same image with `THREERECO_DEMO=true`. It holds made-up
people and trades, shows a "Demo: nothing here is real" banner, never sends email,
has no sign-up, no phone alerts, no exports and no privacy-delete, and tells search
engines to stay away. Sign-in has three one-click buttons (Buyer, Seller, Collector);
their password is public on purpose.

It will not start unless the database name ends in `_demo`, the bucket name has
`demo` in it, and there is no Resend key, SMTP host, push key or dev mode. Seeding
needs the flag and an empty database.

Files: `deployments/docker-compose.demo.yml` (own Postgres and MinIO, API on
`127.0.0.1:8181`), `deployments/.env.demo.example`, `deployments/demo/reset.sh`.

Set up once (you do these):

1. DNS: point `demo.3reco.co.za` at the server.
2. Proxy and TLS: send `demo.3reco.co.za` to `127.0.0.1:8181`.
3. Copy `deployments/.env.demo.example` to `.env.demo` in the repo root and fill in
   new secrets. Do not reuse the live ones.
4. Start it:
   `docker compose -f deployments/docker-compose.demo.yml --env-file .env.demo up -d --build`
5. Fill it the first time: `deployments/demo/reset.sh`.
6. Nightly reset (01:00 UTC is 03:00 in South Africa), in `crontab -e`:
   `0 1 * * * cd /path/to/3reco && deployments/demo/reset.sh >> /var/log/3reco-demo-reset.log 2>&1`

`reset.sh` stops the demo API, wipes the demo database and bucket, migrates, seeds
and starts the API. If it fails, the API stays stopped and the exit code is not 0.
By hand, outside Docker: `THREERECO_DEMO=true 3reco demo seed` (empty database only)
or `3reco demo reset --yes`.

## Phone alerts

Phone alerts are web push: a person switches them on in Profile, Alerts, and the
browser then shows the same alerts as the bell, even when 3REco is closed. They
need a fixed VAPID key pair; a new pair makes every saved subscription useless.
Make one with `npx web-push generate-vapid-keys` (or webpush-go's
`GenerateVAPIDKeys`), set both keys and `THREERECO_VAPID_SUBJECT`, and keep the
private key as secret as `THREERECO_FIELD_KEY`. With either key empty, push is
off and the switch says so. `task dev` sets a dev-only pair from `Taskfile.yml`;
never use it in production. The service worker (`/sw.js`) caches only the built
app files, never `/api`.

## Web app

The Go binary also serves the built web app (`web/apps/app/dist`): files under
`/assets` are cached for a year (their names carry a hash), `index.html` is never
cached, and any other page path that is not under `/api` gets `index.html` so the
browser router can take over. Responses are gzipped. An unknown `/api/...` path is
still a JSON 404. The Docker image (`deployments/Dockerfile`) builds the web app and
copies it to `/web/apps/app/dist`, so one container serves both. If the folder has no
`index.html`, the API still runs and logs one warning.

In development, `task dev` runs Vite on :5173 and proxies `/api` to :8180.

## Ports

| Port | What |
| --- | --- |
| 8180 | the API |
| 5173 | the Vite dev server |
| 5441 | Postgres (container port 5432) |
| 1026 / 8026 | Mailpit SMTP / inbox and API |
| 9010 / 9011 | MinIO S3 / console |

These sit next to Viper's ports (5440, 1025, 8025, 9000), so both can run at once.

## Start and stop

```
task up      # start the three services
task down    # stop them, keep the data
task nuke    # stop them and delete the data
```

The API runs the SQL migrations by itself when it starts. `3reco migrate` runs them and stops.

## Production notes

- Set `THREERECO_COOKIE_SECURE=true` so session cookies only travel over HTTPS.
- Set `THREERECO_WEB_ORIGIN` to the real web address. CORS, CSRF, WebSockets and email links all use it.
- Set `RESEND_API_KEY` and `AUTH_FROM_EMAIL`. Without a key, mail only works to an SMTP host.
- Behind a proxy, set `THREERECO_TRUSTED_PROXIES`, or every visitor shares one address and the sign-in limit hits everyone.
- `3reco health` exits 0 when the server answers; the Docker image uses it as its health check.

## Field key

ID numbers, bank account numbers and e-wallet ids are stored encrypted (AES-256-GCM).
The key is `THREERECO_FIELD_KEY`: 32 random bytes, base64 encoded. The server refuses to start without a valid one.

Make one, once, and store it in your secret manager:

```
openssl rand -base64 32
```

- Keep a copy apart from the database backups. A backup with its key beside it is no longer protected.
- **If the key is lost, those fields are lost.** Nothing can read them back; people have to enter them again.
- Do not change the key on a running system. Values written with the old key stop opening. There is no re-key command yet.
- `task` sets a fixed dev key. Never reuse it in production.

## Privacy rights and clean-up

- `GET /api/privacy/export` gives a person all their own data. `POST /api/privacy/delete` erases their account after a password check.
- Once an hour the server deletes notifications and carts older than 90 days, personal details on trades older than 5 years, and audit lines older than 2 years. The periods are in `internal/platform/config/privacy.go`.
- `privacy_events` is the audit log: who exported, deleted, or read a full ID or bank number. Admins read it at `GET /api/admin/privacy-events`.
- Raising `NoticeVersion` in the same file makes the notice show again as not accepted.

## Backups

Everything that matters is in two places: the Postgres database and the S3 bucket.
Back up both. A database backup alone loses the uploaded files, and the other way round.

```
pg_dump "$THREERECO_DATABASE_URL" --format=custom --file=threereco.dump
```

Sessions and rate counts are in the database. After a restore, everyone may need to sign in again.

## Old sign-ins

Passwords from the first 3REco (Better Auth, scrypt) still work. The first good sign-in
replaces the old hash with argon2id.

## Moving from Convex (done once)

The first 3REco ran on Convex. The data was moved with `3reco import-convex`, which
stays in the binary for a rerun or a second export. It reads an `npx convex export`
file; nothing else of Convex is left in the stack.

Run it on an empty database, with the API stopped.

1. Export from Convex: `npx convex export --path export.zip --include-file-storage`.
   The ZIP holds personal data and password hashes. Keep it out of git.
2. `task up`, then `task migrate`.
3. `task import-convex -- export.zip`.
4. Check the table of counts it prints: `source` and `loaded` must match on every line.

The import checks every row first. If any row breaks a rule (two users with one
email, a stock row with no owner, a number that is not a number), it writes nothing,
prints each bad row as `table`, `_id`, `field` and the reason, and exits with an
error. Fix the data at the source, export again and rerun. A second run on a database
that already has users is refused.

Sessions are not imported, so everyone signs in again with their old password
(it is upgraded on the first sign-in). Old chat messages are marked read.
A login with no profile in the export is imported as a user with no role, who
finishes their profile after signing in. Sales whose collector was deleted keep
the collector details saved on the sale.
