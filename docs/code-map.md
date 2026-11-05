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
| `0004_domain_api.sql` | `request_message_reads`, message and market indexes, `notify_change()` for read marks |

Never rename a merged migration. Add a new file.

## Auth

| Job | Owner |
| --- | --- |
| Users, sessions, one-time tokens, rate counts (SQL only) | `internal/stores/auth/auth.go` |
| Password hashing (argon2id) and old Better Auth scrypt check | `internal/services/auth/password.go` |
| Sign-up, sign-in, sessions, verify email, reset password, admin create, roles | `internal/services/auth/auth.go` |
| Session cookie, device cookie, who is calling, `RequireUser`, `RequireRole`, CSRF, rate limit | `internal/api/middleware/middleware.go` |
| `/api/auth/*` routes | `internal/api/auth/handlers.go` |

## Trade and operations

| Job | Owner |
| --- | --- |
| Cursor paging: page shape, cursor, limit | `internal/platform/paging/paging.go` |
| Shared SQL: safe display name, SAST effective date, `Party` | `internal/platform/database/sql.go` |
| Notifications: SQL, rules, `/api/notifications` routes | `internal/stores/notifications`, `internal/services/notifications`, `internal/api/notifications` |
| Requests, offers, accept and the other moves, messages, inbox | `internal/stores/requests`, `internal/services/requests`, `internal/api/requests` |
| Transactions: lists, detail, collector sale, direct sale, stock moves, invoice hook | `internal/stores/transactions`, `internal/services/transactions`, `internal/api/transactions` |
| Invoice and receipt routes (access check, then 501 until T10) | `internal/api/transactions/receipts.go` |
| Store reviews, public review lists, admin remove | `internal/stores/reviews`, `internal/services/reviews`, `internal/api/reviews` |
| Admin users, role change, removal, the three dashboards | `internal/stores/admin`, `internal/services/admin`, `internal/api/admin` |
| Wiring of the trade area into the server | `internal/api/trade.go` |

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
| Trade tests: requests, messages, transactions, access, reviews, notifications, admin, dashboards | `tests/*_test.go` named for the area, helpers in `tests/trade_helpers_test.go` |

## Catalog, stores and profiles

| Job | Owner |
| --- | --- |
| Collector create, detail, patch and confirmed removal handlers | `internal/api/collectors/crud.go` |
| Collector route registration and managed directories | `internal/api/collectors/handler.go` |
| Scoped collector phone statistics handler | `internal/api/collectors/stats.go` |
| Caller-owned cart handlers | `internal/api/market/cart.go` |
| Public listing detail handler | `internal/api/market/detail.go` |
| Market and cart route registration | `internal/api/market/handler.go` |
| Public listing filters and seller listing handlers | `internal/api/market/listings.go` |
| Catalog reads and administrator mutation handlers | `internal/api/materials/catalog.go` |
| Material catalog route registration | `internal/api/materials/handler.go` |
| Private profile edits and safe account directory handlers | `internal/api/profile/handler.go` |
| Owner stock mutation handlers | `internal/api/stock/crud.go` |
| Stock route registration and reads | `internal/api/stock/handler.go` |
| Public store route registration | `internal/api/stores/handler.go` |
| Public store detail and directory handlers | `internal/api/stores/profile.go` |
| Collector management scope, redaction and PATCH preservation | `internal/services/collectors/collectors.go` |
| Staff or creator-business phone statistics authorization | `internal/services/collectors/stats.go` |
| Complete bank or ewallet payout and collector input rules | `internal/services/collectors/validation.go` |
| Cart ownership and listed stock validation | `internal/services/market/cart.go` |
| Public listing visibility and review summary composition | `internal/services/market/listings.go` |
| Marketplace service construction | `internal/services/market/market.go` |
| Administrator catalog rules and reference protection | `internal/services/materials/materials.go` |
| Caller-only profile edits, bank completeness and safe directory reads | `internal/services/profile/profile.go` |
| Shared South African phone, bank and address validation | `internal/services/profile/validation.go` |
| Stock visibility notification content and atomic insertion | `internal/services/stock/listing.go` |
| Stock ownership, row locks and exact decimal/base-price validation | `internal/services/stock/stock.go` |
| Active store visibility and composition with the review service | `internal/services/stores/profile.go` |
| Store service construction and review dependency | `internal/services/stores/stores.go` |
| Collector records, creator scope and phone conflict SQL | `internal/stores/collectors/collectors.go` |
| Exact collector collection totals and recent transaction SQL | `internal/stores/collectors/stats.go` |
| Buyer-scoped cart persistence and available stock SQL | `internal/stores/market/cart.go` |
| Safe listed-market filters and detail SQL | `internal/stores/market/listings.go` |
| Marketplace store construction | `internal/stores/market/market.go` |
| Catalog persistence and foreign-key protected deletion SQL | `internal/stores/materials/materials.go` |
| Private profile and allowlisted public account SQL | `internal/stores/profile/profile.go` |
| Stock listing notification SQL within the stock transaction | `internal/stores/stock/listing.go` |
| Owner inventory, stock locks and material base-price SQL | `internal/stores/stock/stock.go` |
| Safe active business profiles and listed-stock aggregate SQL | `internal/stores/stores/profile.go` |
| Public store database construction | `internal/stores/stores/stores.go` |
| Cart isolation, unavailable stock and stale visibility tests | `tests/cart_test.go` |
| Collector payout redaction, creator scope, phone leaks and PATCH tests | `tests/collectors_test.go` |
| Market visibility, filters, cursor tests and shared Chunk A fixtures | `tests/market_test.go` |
| Public catalog and administrator-only mutation tests | `tests/materials_test.go` |
| Profile email protection, bank rules and public account leak tests | `tests/profile_test.go` |
| Stock ownership, explicit zero price and notification rollback tests | `tests/stock_test.go` |
| Store profiles, listed inventory summaries and public reviews integration tests | `tests/stores_test.go` |
