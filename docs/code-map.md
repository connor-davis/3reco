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
| A4 invoice layout, wrapping, pagination and exact decimal formatting (MIT-licensed go-pdf/fpdf) | `pdf/invoice.go` |

## Database tables (`internal/platform/database/migrations`)

| Migration | Holds |
| --- | --- |
| `0001_users_auth.sql` | `users`, `sessions`, `auth_tokens`, `rate_counts` |
| `0002_market.sql` | collectors, materials, stock, transactions and their items and receipts, requests and their items and messages, notifications, carts, reviews |
| `0003_realtime.sql` | `notify_change()` and the `realtime` trigger on each live table |
| `0004_domain_api.sql` | `request_message_reads`, message and market indexes, `notify_change()` for read marks |
| `0005_files_invoices.sql` | `users.avatar_key`, preserving legacy identity images |
| `0006_stock_holds.sql` | `stock_holds`, exact held/available SQL functions and hold realtime topics |
| `0007_privacy.sql` | `privacy_notice_acceptances`, `privacy_events`, `transactions.anonymised_at` |
| `0008_perf_indexes.sql` | Sort-order indexes for market, stock, transactions, requests, messages, notifications and users |
| `0009_quiet_read_receipts.sql` | Drops the `realtime` trigger on `request_message_reads` |
| `0010_keep_transactions.sql` | Blocks DELETE and TRUNCATE on `transactions`, `transaction_items` and `transaction_receipts` (trade records are kept; personal details go by UPDATE) |
| `0012_guest_role.sql` | Every user has a role: backfills no-role users to `guest`, adds `guest` to the role check, default `guest`, NOT NULL |

Never rename a merged migration. Add a new file.

## Auth

| Job | Owner |
| --- | --- |
| Users, sessions, one-time tokens, rate counts (SQL only) | `internal/stores/auth/auth.go` |
| Password hashing (argon2id) and old Better Auth scrypt check | `internal/services/auth/password.go` |
| Sign-up, sign-in, sessions, verify email, reset password, admin create, roles | `internal/services/auth/auth.go` |
| Session cookie, device cookie, who is calling, `RequireUser`, `RequireRole`, CSRF, rate limit | `internal/api/middleware/middleware.go` |
| `/api/auth/*` routes | `internal/api/auth/handlers.go` |
| Guest gate: a signed-in guest may only use their own account, profile, setup and privacy notice (`RequireSetup`, `guestPaths`) | `internal/api/middleware/middleware.go`, registered in `internal/api/server.go` |
| Guest and setup tests (403 on every gated area, setup rules) | `tests/guest_test.go` |

## Trade and operations

| Job | Owner |
| --- | --- |
| Cursor paging: page shape, cursor, limit | `internal/platform/paging/paging.go` |
| Shared SQL: safe display name, SAST effective date, `Party` | `internal/platform/database/sql.go` |
| Encrypting ID and bank fields (AES-256-GCM, `v1:` prefix) and the `******1234` mask | `internal/platform/crypt/crypt.go` |
| Notice version and retention periods (the one place to change them) | `internal/platform/config/privacy.go` |
| Export, self-delete, notice, audit log, hourly retention: SQL, rules, `/api/privacy` routes | `internal/stores/privacy`, `internal/services/privacy`, `internal/api/privacy` |
| Who sees a collector's full account number (creator, own login, admin; the rest masked) | `internal/services/collectors/collectors.go` |
| Privacy tests: ciphertext at rest, mask and full view, export, delete, retention, notice, audit | `tests/privacy_test.go`, `tests/privacy_rights_test.go`, `tests/fieldcrypt_test.go` |
| Notifications: SQL, rules, `/api/notifications` routes | `internal/stores/notifications`, `internal/services/notifications`, `internal/api/notifications` |
| Requests, offers, accept and the other moves, messages, inbox | `internal/stores/requests`, `internal/services/requests`, `internal/api/requests` |
| Admin read-only view of every chat: the all-conversations list and the read-only rule | `internal/stores/requests/messages.go` (`AllThreads`), `internal/services/requests` (`loadForRead`, `AllThreads`), `GET /api/messages/all` |
| The admin All conversations page | `web/apps/app/src/routes/admin/chats.tsx` |
| Admin chat tests (read, list, no write, no read receipts, live) | `tests/admin_chat_test.go` |
| Offer reservation locks, releases and set-based expiry SQL | `internal/stores/requests/holds.go` |
| The 48-hour offer lifetime and atomic expiry notifications | `internal/services/requests/holds.go` |
| Stock availability and fenced hold consumption during settlement | `internal/stores/transactions/holds.go` |
| Transactions: lists, detail, collector sale, direct sale, stock moves, invoice hook | `internal/stores/transactions`, `internal/services/transactions`, `internal/api/transactions` |
| Authorized multipart receipt upload and streamed receipt/invoice downloads | `internal/api/transactions/receipts.go` |
| Bounded image sniffing, receipt participation, SHA duplicates, five-file lock and failed-write cleanup | `internal/services/files/receipts.go` |
| Receipt metadata, transaction row lock and scoped object lookup SQL | `internal/stores/files/files.go` |
| Snapshot-first private document reads, invoice key locking/replacement and bounded export ID pages | `internal/stores/transactions/documents.go` |
| After-commit invoice hook, document composition, storage replacement, attached buyer mail and on-demand recovery | `internal/services/invoices/invoices.go` |
| CSV download routes and response streaming | `internal/api/admin/exports.go` |
| Export roles, inclusive timestamps, exact columns, SAST formatting and formula guard | `internal/services/admin/exports.go` |
| Streaming allowlisted active account export SQL | `internal/stores/admin/exports.go` |
| Store reviews, public review lists, admin remove | `internal/stores/reviews`, `internal/services/reviews`, `internal/api/reviews` |
| Admin users, role change, removal, the three dashboards | `internal/stores/admin`, `internal/services/admin`, `internal/api/admin` |
| Wiring of the trade area into the server | `internal/api/trade.go` |

## Realtime

| Job | Owner |
| --- | --- |
| Which topic a row change goes to | `notify_change()` in `0003_realtime.sql` |
| Hold changes to market, seller stock and both request participants | `notify_stock_hold()` in `0006_stock_holds.sql` |
| Listen to Postgres, who may join which topic, fan out events | `internal/services/realtime/hub.go` |
| `GET /api/live` WebSocket route | `internal/api/sockets/handler.go` |

## Server

| Job | Owner |
| --- | --- |
| Fiber app, shared steps (incl. `/api` compression, skipped for the socket and streams), error handler, fx wiring, listener, hourly purge and offer expiry loop | `internal/api/server.go` |
| The binary: `serve`, `migrate`, `admin create`, `import-convex`, `health`, `version` | `cmd/3reco/main.go` |

## Tests

| Job | Owner |
| --- | --- |
| Fresh database per test, running API, cookie client, Mailpit reader | `tests/testutil/testutil.go` |
| Unique MinIO test bucket, required-service gate and object/bucket cleanup | `tests/testutil/storage.go` |
| Receipt sniffing, access leaks, SHA duplicate cleanup and concurrent sixth upload | `tests/receipts_test.go` |
| Invoice authorization, exact decimals, pagination, snapshots, regeneration, rollback and attached Mailpit messages | `tests/invoices_test.go` |
| Five CSV schemas, role/owner scope, effective date bounds, escaping and formula guard | `tests/exports_test.go` |
| Code rules: doc comments, file length | `tests/style_test.go` |
| Offer holds, races, rollback, expiry, stock safeguards, availability and realtime | `tests/stock_holds_test.go` |
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
| Finish setup: a guest picks collector or business once, required fields checked | `internal/services/profile/setup.go`, `Finish` in `internal/stores/profile/profile.go`, `POST /api/profile/setup` |
| Caller avatar upload/delete and public image stream with cache headers | `internal/api/profile/avatar.go` |
| Avatar byte validation, caller-only replacement and after-commit object removal | `internal/services/profile/avatar.go` |
| Active avatar reference reads, row locks and updates | `internal/stores/profile/avatar.go` |
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

## Web API client and public statistics

| Job | Owner |
| --- | --- |
| Public settled trade totals and top five stores SQL | `internal/stores/stats/stats.go` |
| Public statistics service | `internal/services/stats/stats.go` |
| Public `/api/stats` handler | `internal/api/stats/handler.go` |
| Public totals, exact decimals and private field exclusion tests | `tests/stats_test.go` |
| Credentialed HTTP, errors, downloads and paging | `web/apps/app/src/lib/api/client.ts`, `paging.ts` |
| Go JSON contracts and resource query/mutation hooks | `web/apps/app/src/lib/api/types.ts`, resource files in `src/lib/api/` |
| Shared socket, topic subscriptions and cache invalidation | `web/apps/app/src/lib/live/use-live.ts`, `connection.ts` |
| HTTP error/decimal contracts and socket lifecycle tests | `web/apps/app/tests/api.test.mjs` |
| Deferred desktop dialog / phone drawer implementation | `web/apps/app/src/components/responsive-overlay-body.tsx` (loaded by `responsive-overlay.tsx`) |
| Deferred notification list, paging and actions | `web/apps/app/src/components/shell/notification-tray-list.tsx` (bell in `notification-tray.tsx`) |
| Signed-in user context and auth query cache | `web/apps/app/src/lib/auth/`, `src/lib/api/auth.ts` |
| API error to form field errors | `web/apps/app/src/lib/form-errors.ts` |
| Auth page layout (sign-in, sign-up, verify, reset) | `web/apps/app/src/components/auth-shell.tsx`, routes `src/routes/{sign-in,sign-up,verify-email,forgot-password,reset-password}.tsx` |
| Full-page setup (`/setup`): choose collector or business, then the forms in `routes/profile/-components/forms.tsx` | `web/apps/app/src/routes/setup.tsx` |
| Who must finish setup (guest, or unfinished collector/business) and the redirect | `web/apps/app/src/lib/setup.ts`, `src/components/setup-gate.tsx` (wraps the outlet in `routes/__root.tsx`), tests in `tests/setup.test.mjs` |
| Tidy a person's name (ALL CAPS / all lower only); used on first/last name, sign-up and collector name | `web/apps/app/src/lib/names.ts` (`personName` prop of `TextField`), tests in `tests/names.test.mjs` |
| Role gate per page, role labels, role nav and phone tabs | `web/apps/app/src/lib/access.ts`, `src/components/access-guard.tsx`, `src/lib/nav.ts` |

## Web app serving and deployment

| Job | Owner |
| --- | --- |
| Serve `web/apps/app/dist`: long cache on `/assets`, `index.html` never cached, page fallback, gzip, one log when the folder is missing | `internal/api/web.go` |
| Where the built web app lives (`THREERECO_WEB_DIST`) | `internal/platform/config/config.go` |
| Static serving tests: fallback, cache headers, JSON 404 on `/api`, missing folder | `tests/web_test.go` |
| One image: builds the web app, builds the binary, copies `dist` in | `deployments/Dockerfile` |
| Production stack (api, Postgres, MinIO, docs) | `docker-compose.yml`, `.env.example` |
| One-command production deploy (writes `.env`, starts the stack) | `deploy.sh` |

## Convex import (`import-convex`)

| Job | Owner |
| --- | --- |
| Run order: empty check, plan, strict stop, file upload, one transaction, rollback of files | `internal/services/importer/convex.go` |
| Open the export ZIP safely, find a table's `documents.jsonl`, read blobs, decode `$integer`/`$float` | `internal/services/importer/zip.go` |
| Field tables, exact numbers, times, checks that report bad rows | `internal/services/importer/values.go` |
| Users joined with Better Auth logins, passwords, removed users, data-URL avatars | `internal/services/importer/auth.go` |
| Collectors, materials, stock, notifications, carts, reviews | `internal/services/importer/market.go` |
| Transactions, receipts, invoices, requests, messages and read marks | `internal/services/importer/market_trades.go` |
| MinIO uploads, rollback removal, sha256 | `internal/services/importer/files.go` |
| Counts and bad-row report | `internal/services/importer/report.go` |
| Empty check, lock, trigger switch, inserts, counts (all the SQL) | `internal/stores/importer/store.go` |
| Made-up export and tests for the import | `tests/import_fixture_test.go`, `tests/import_test.go` |
