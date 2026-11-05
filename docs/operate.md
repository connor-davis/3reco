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
| `THREERECO_DEV` | `false` | Dev mode: coloured logs, and mail goes to Mailpit when no Resend key is set. |
| `THREERECO_COOKIE_SECURE` | `false` | Set true in production so session cookies are HTTPS only. |
| `THREERECO_TRUSTED_PROXIES` | (empty) | Comma-separated proxy addresses whose X-Forwarded-For is believed. |
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
