# Code map

Which file owns which job. Read this before you write a new helper, and add a
line when you add an owner.

## Platform (`internal/platform`)

| Job | Owner |
| --- | --- |
| Read every setting from the environment; the list of variables | `config/config.go` (`EnvVars`, `Load`) |
| Errors a user can cause (400, 401, 403, 404, 409, 429) | `apperr/apperr.go` |
| Postgres pool, transaction helper, run-after-commit, new ids, unique-violation check | `database/database.go` |
| SQL migrations: runner, then the files in order | `database/migrate.go`, `database/migrations/*.sql` |
| Send email (Resend, or SMTP to Mailpit) and the action email template | `mail/mail.go` |
| Files in MinIO or S3: put, get, remove, presign | `storage/storage.go` |

## Database tables (`internal/platform/database/migrations`)

| Migration | Holds |
| --- | --- |
| `0001_users_auth.sql` | `users`, `sessions`, `auth_tokens`, `rate_counts` |
| `0002_market.sql` | collectors, materials, stock, transactions and their items and receipts, requests and their items and messages, notifications, carts, reviews |
| `0003_realtime.sql` | `notify_change()` and the `realtime` trigger on each live table |

Never rename a merged migration. Add a new file.

## Auth

| Job | Owner |
| --- | --- |
| Users, sessions, one-time tokens, rate counts (SQL only) | `internal/stores/auth/auth.go` |
| Password hashing (argon2id) and old Better Auth scrypt check | `internal/services/auth/password.go` |
| Sign-up, sign-in, sessions, verify email, reset password, admin create, roles | `internal/services/auth/auth.go` |
| Session cookie, device cookie, who is calling, `RequireUser`, `RequireRole`, CSRF, rate limit | `internal/api/middleware/middleware.go` |
| `/api/auth/*` routes | `internal/api/auth/handlers.go` |

## Realtime

| Job | Owner |
| --- | --- |
| Which topic a row change goes to | `notify_change()` in `0003_realtime.sql` |
| Listen to Postgres, who may join which topic, fan out events | `internal/services/realtime/hub.go` |
| `GET /api/live` WebSocket route | `internal/api/sockets/handler.go` |

## Server

| Job | Owner |
| --- | --- |
| Fiber app, shared steps, error handler, fx wiring, listener, hourly purge | `internal/api/server.go` |
| The binary: `serve`, `migrate`, `admin create`, `health`, `version` | `cmd/3reco/main.go` |

## Tests

| Job | Owner |
| --- | --- |
| Fresh database per test, running API, cookie client, Mailpit reader | `tests/testutil/testutil.go` |
| Code rules: doc comments, file length | `tests/style_test.go` |
| Password hashes, with vectors made by Better Auth's own code | `tests/password_test.go` |
| Auth routes, sessions, leaks, rate limit | `tests/auth_test.go` |
| WebSocket events | `tests/realtime_test.go` |
