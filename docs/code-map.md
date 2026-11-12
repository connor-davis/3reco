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
| Bounded PNG/JPEG/WEBP byte sniffing and image size limits | `storage/image.go` (`Image`) |
| Files in MinIO or S3: put, get, remove, presign | `storage/storage.go` |
| A4 invoice layout, wrapping, pagination and exact decimal formatting (MIT-licensed go-pdf/fpdf) | `pdf/invoice.go` |

## Database tables (`internal/platform/database/migrations`)

| Migration | Holds |
| --- | --- |
| `0001_users_auth.sql` | `users`, `sessions`, `auth_tokens`, `rate_counts` |
| `0002_market.sql` | collectors, materials, stock, transactions and their items and receipts, requests and their items and messages, notifications, carts, reviews |
| `0003_realtime.sql` | First `notify_change()` and the `realtime` trigger on each live table (topic based, replaced by 0014) |
| `0004_domain_api.sql` | `request_message_reads`, message and market indexes, `notify_change()` for read marks |
| `0005_files_invoices.sql` | `users.avatar_key`, preserving legacy identity images |
| `0006_stock_holds.sql` | `stock_holds`, exact held/available SQL functions and hold realtime events |
| `0007_privacy.sql` | `privacy_notice_acceptances`, `privacy_events`, `transactions.anonymised_at` |
| `0008_perf_indexes.sql` | Sort-order indexes for market, stock, transactions, requests, messages, notifications and users |
| `0009_quiet_read_receipts.sql` | Drops the `realtime` trigger on `request_message_reads` |
| `0010_keep_transactions.sql` | Blocks DELETE and TRUNCATE on `transactions`, `transaction_items` and `transaction_receipts` (trade records are kept; personal details go by UPDATE) |
| `0011_chat_activity.sql` | Indexed inbox activity and message broadcasts to both participants and `admin:requests` |
| `0012_guest_role.sql` | Every user has a role: backfills no-role users to `guest`, adds `guest` to the role check, default `guest`, NOT NULL |
| `0013_collector_optional_phone.sql` | Allows absent collector phones as NULL |
| `0014_realtime_recipients.sql` | `notify_change()` and `notify_stock_hold()` send kind, id, op and recipients; `realtime` triggers on collectors, store_reviews and transaction_receipts; narrower users trigger |
| `0015_market_flow.sql` | Cart quantities, requested terms, versioned offers, dual confirmation and retained transaction status |
| `0016_request_system_messages.sql` | Explicit system request events sharing message unread tracking |
| `0017_export_audit_details.sql` | Download kind and filters on privacy export audit events |
| `0018_receipt_delete.sql` | Drops the row-delete block on `transaction_receipts` so a receipt can be removed (the trade stays undeletable) |
| `0020_stock_images.sql` | One photo per stock item and live business logo changes |
| `0021_business_verification.sql` | `users.business_verified_at/by`, privacy kind `business_verify`, notification type `business_verified`, users realtime trigger watches the new column |

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
| Cursor paging: page shape, cursor, limit, list search pattern | `internal/platform/paging/paging.go` |
| Transaction list filters (q, type, days) and totals | `internal/services/transactions/filter.go`, `internal/stores/transactions/transactions.go` |
| Shared SQL: safe display name, SAST effective date, `Party` | `internal/platform/database/sql.go` |
| Encrypting ID and bank fields (AES-256-GCM, `v1:` prefix) and the `******1234` mask | `internal/platform/crypt/crypt.go` |
| Notice version and retention periods (the one place to change them) | `internal/platform/config/privacy.go` |
| Export, self-delete, notice, audit log, hourly retention: SQL, rules, `/api/privacy` routes | `internal/stores/privacy`, `internal/services/privacy`, `internal/api/privacy` |
| Collector payout masks (including branch code), safe `can_edit` permission, staff contact-only form edits | `internal/services/collectors/collectors.go`, `internal/services/collectors/stats.go`, `web/apps/app/src/components/dialogs/collector-dialog.tsx` |
| Reuse collector payout access for frozen invoice/CSV snapshots | `internal/services/collectors/payout_access.go` (`CanReadFullPayout`), `internal/services/invoices/invoices.go` (`Project`) |
| Collector `can_view_payout`, six-digit branch code, phone-digit search, admin full-view audit only when disclosed | `internal/services/collectors/{collectors,validation}.go`, `internal/stores/collectors/collectors.go` (`searchTerms`) |
| Collection total of at least R 0.01 | `internal/services/transactions/parse.go` (`checkCollectionTotal`), `web/apps/app/src/components/dialogs/collection-dialog.tsx` |
| Role change is live: `RecheckUser` after commit, guest sockets hear only their own id | `internal/services/realtime/{hub,recheck,routing}.go`, `internal/services/admin/users.go` (`SetRole`) |
| Removed reason wins over a generic sign-out; a silent socket drop checks the session | `web/apps/app/src/lib/api/auth.ts` (`endSession`), `web/apps/app/src/lib/live/{connection,use-live}.ts` |
| Privacy tests: ciphertext at rest, mask and full view, export, delete, retention, notice, audit | `tests/privacy_test.go`, `tests/privacy_rights_test.go`, `tests/fieldcrypt_test.go` |
| Notifications: SQL, rules, `/api/notifications` routes | `internal/stores/notifications`, `internal/services/notifications`, `internal/api/notifications` |
| Delete a finished request's action notices for every user at closure (outcome notice stays, chat notices only marked read) | `RequestEnded` in `internal/services/notifications/notifications.go`, `DeleteRequestActions` in `internal/stores/notifications/notifications.go` |
| Offer and counter system events drive inbox preview, activity time and paging | `MakeOffer` in `internal/services/requests/state.go`, `InsertRequestEvent` in `internal/stores/requests/messages.go` |
| Requests, offers, accept and the other moves, messages, inbox | `internal/stores/requests`, `internal/services/requests`, `internal/api/requests` |
| Offer author/version, confirmation resets and live-hold fence | `internal/stores/requests/confirmations.go` |
| Pending trade creation and completion of the same retained row | `internal/services/transactions/pending.go`, `internal/stores/transactions/pending.go` |
| Admin read-only view of every chat: the all-conversations list and the read-only rule | `internal/stores/requests/messages.go` (`AllThreads`), `internal/services/requests` (`loadForRead`, `AllThreads`), `GET /api/messages/all` |
| Unified participant/admin inbox, server search, infinite scroll and recent-first chat history | `web/apps/app/src/components/chat/{inbox,conversation}.tsx`, `web/apps/app/src/lib/api/messages.ts` |
| Inbox offer author and pending confirmations, closed-state summary | `web/apps/app/src/components/chat/helpers.ts` (`threadSummary`), `internal/stores/requests/messages.go` |
| Weight and price messages for every form (sign and zero first, then number, decimals, stock) | `quantityError`, `priceError` in `web/apps/app/src/lib/quantity.ts` |
| Incoming and outgoing request lists; each row is one link to the chat | `web/apps/app/src/routes/market/-components/request-list.tsx` |
| Fresh request system line and seller unread event | `internal/services/requests/requests.go`, `internal/stores/requests/messages.go`, `tests/messages_test.go` |
| Round 2 phone-search and unchanged guest-access regression tests | `tests/qa_round2_{collectors,guest}_test.go` |
| Round 2 shell, inbox, review and privacy regression tests; isolated TS loader | `web/apps/app/tests/qa-round2-{shell,guest,inbox,admin}.test.mjs`, `qa-round2-loader.mjs`; discovered by the `tests/*.test.mjs` npm test glob |
| Admin chat tests (read, list, no write, no read receipts, live) | `tests/admin_chat_test.go` |
| Inbox search/filter scope and newest-first message cursor tests | `tests/messages_paging_test.go` |
| Offer reservation locks, releases and set-based expiry SQL | `internal/stores/requests/holds.go` |
| The 48-hour offer lifetime and atomic expiry notifications | `internal/services/requests/holds.go` |
| Stock availability and fenced hold consumption during settlement | `internal/stores/transactions/holds.go` |
| Transactions: lists, detail, collector sale, direct sale, stock moves, invoice hook | `internal/stores/transactions`, `internal/services/transactions`, `internal/api/transactions` |
| Authorized multipart receipt upload and streamed receipt/invoice downloads | `internal/api/transactions/receipts.go` |
| Receipt participation, SHA duplicates, five-file lock and failed-write cleanup | `internal/services/files/receipts.go` |
| Receipt metadata, transaction row lock and scoped object lookup SQL | `internal/stores/files/files.go` |
| Receipt removal (`DELETE /api/transactions/:id/receipts/:receipt_id`: access rule, row delete, file removed after commit) | `Remove` in `internal/services/files/receipts.go`, `receiptRemove` in `internal/api/transactions/receipts.go` |
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
| Who hears a row change (user ids or an audience word, never row data) | `notify_change()` and `notify_stock_hold()` in `0014_realtime_recipients.sql` |
| Open sockets, indexed by user and role | `internal/services/realtime/hub.go` |
| Listen to Postgres | `internal/services/realtime/listen.go` |
| Turn a NOTIFY into one encoded event for its recipients | `internal/services/realtime/routing.go` |
| Every 30 s drop dead sessions and guests, refresh roles | `internal/services/realtime/recheck.go` |
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
| Receipt sniffing, access leaks, SHA duplicate cleanup, concurrent sixth upload and upload/removal role rules | `tests/receipts_test.go`, `tests/receipts_roles_test.go` |
| Invoice authorization, exact decimals, pagination, snapshots, regeneration, rollback and attached Mailpit messages | `tests/invoices_test.go` |
| Five CSV schemas, role/owner scope, effective date bounds, escaping and formula guard | `tests/exports_test.go` |
| Round 3 trade regressions: payout roles and mail attachments, weight writes, stock prices, history, export filters and negotiated reviews | `tests/qa_round3_trade_test.go`, `web/apps/app/tests/qa-round3-trade.test.mjs` |
| Code rules: doc comments, file length | `tests/style_test.go` |
| Offer holds, races, rollback, expiry, stock safeguards, availability and realtime | `tests/stock_holds_test.go` |
| Round 19 stock visibility changes leave the actor's bell empty | `tests/qa_round19_a_test.go` |
| Request terms, dual confirmation, pending isolation, counter/cancellation, privacy and migration backfill | `tests/market_flow_test.go` |
| Password hashes, with vectors made by Better Auth's own code | `tests/password_test.go` |
| Auth routes, sessions, leaks, rate limit | `tests/auth_test.go` |
| WebSocket handshake, ping, recheck | `tests/realtime_test.go` |
| Who hears each kind of change | `tests/realtime_routing_test.go` |
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
| Verified business counts as creator of every collector (`creator`, `verifiedBusiness`), also for stats and payout reads | `internal/services/collectors/collectors.go`, `stats.go`, `payout_access.go`; flag `BusinessVerified` loaded with the session in `internal/stores/auth/auth.go` |
| Admin verifies or un-verifies a business: role check, audit, notification, recheck; clears on role change and erase | `internal/services/admin/verification.go`, `internal/stores/admin/users.go`, `internal/stores/privacy/erase.go`, route `PUT /admin/users/:id/business-verification` in `internal/api/admin/handler.go` |
| Business verification tests | `tests/business_verification_test.go`, `web/apps/app/tests/business-verification.test.mjs` |
| Verified badge, Verify action (admin users page); collectors page wording; user live event refreshes collectors | `web/apps/app/src/routes/admin/users.tsx`, `routes/collectors.tsx`, `lib/api/admin.ts` (`useSetBusinessVerified`), `lib/live/connection.ts` (`keysFor('user')`) |
| Staff or creator-business phone statistics authorization | `internal/services/collectors/stats.go` |
| Complete bank or ewallet payout and collector input rules | `internal/services/collectors/validation.go` |
| Cart ownership and listed stock validation | `internal/services/market/cart.go` |
| Public listing visibility and review summary composition | `internal/services/market/listings.go` |
| Marketplace service construction | `internal/services/market/market.go` |
| Administrator catalog rules and reference protection | `internal/services/materials/materials.go` |
| Caller-only profile edits, bank completeness and safe directory reads | `internal/services/profile/profile.go` |
| Shared South African phone, bank and address validation | `internal/services/profile/validation.go` |
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
| Credentialed HTTP, errors, downloads and paging | `web/apps/app/src/lib/api/client.ts`, `paging.ts`; search debounce `src/lib/use-debounced.ts`; page reset on filter change `src/components/transactions/pager-state.ts` |
| Go JSON contracts and resource query/mutation hooks | `web/apps/app/src/lib/api/types.ts`, resource files in `src/lib/api/` |
| One socket per tab and cache invalidation by `{kind, id}` | `web/apps/app/src/lib/live/use-live.ts`, `connection.ts` |
| HTTP error/decimal contracts and socket lifecycle tests | `web/apps/app/tests/api.test.mjs` |
| QA round 1 shell fixes (no mojibake, invoice filename, waiting tag, role copy, guest gating, session-ended close 4401) | `web/apps/app/tests/qa-round1-shell.test.mjs` |
| Who a pending trade is waiting for | `web/apps/app/src/lib/waiting.ts` |
| Session-ended socket close code 4401 (revoked, removed or guest) | `internal/services/realtime/hub.go` (`CloseSessionEnded`), `internal/api/sockets/handler.go`, tests in `tests/realtime_revoked_test.go` |
| Admin/staff see a person's real name, not the business name (`PersonName`) | `internal/platform/database/sql.go`, tests in `tests/admin_names_test.go` |
| Finished chats stay in the inbox (`done` filter) | `internal/stores/requests/messages.go`, tests in `tests/inbox_done_test.go` |
| Compact divided list rows, primary taps and sibling More menus | `web/apps/app/src/components/list-row.tsx` |
| Deferred desktop dialog / phone drawer implementation | `web/apps/app/src/components/responsive-overlay-body.tsx` (loaded by `responsive-overlay.tsx`) |
| Deferred notification list, paging and actions | `web/apps/app/src/components/shell/notification-tray-list.tsx` (bell in `notification-tray.tsx`) |
| Signed-in user context and auth query cache | `web/apps/app/src/lib/auth/`, `src/lib/api/auth.ts` |
| API error to form field errors | `web/apps/app/src/lib/form-errors.ts` |
| Auth page layout (sign-in, sign-up, verify, reset) | `web/apps/app/src/components/auth-shell.tsx`, routes `src/routes/{sign-in,sign-up,verify-email,forgot-password,reset-password}.tsx` |
| Full-page setup (`/setup`): choose collector or business, then the forms in `routes/profile/-components/forms.tsx` | `web/apps/app/src/routes/setup.tsx` |
| Who must finish setup (guest, or unfinished collector/business) and the redirect | `web/apps/app/src/lib/setup.ts`, `src/components/setup-gate.tsx` (wraps the outlet in `routes/__root.tsx`), tests in `tests/setup.test.mjs` |
| Tidy a person's name (ALL CAPS / all lower only); used on first/last name, sign-up and collector name | `web/apps/app/src/lib/names.ts` (`personName` prop of `TextField`), tests in `tests/names.test.mjs` |
| Money, weight, date and count formatting (`plural(count, one, many?)` for every on-screen count) | `web/apps/app/src/lib/format.ts`, tests in `tests/counter.test.mjs` |
| One money rule: each line is weight x price rounded half up to cents when written, the trade total is the sum of those lines, and every display rounds the same way; prices stop at 2 decimals | `SetTotal` in `internal/stores/transactions/items.go`, `pdf.Product` / `pdf.Decimal`, `toCents` / `lineCents` in `web/apps/app/src/lib/format.ts`, tests in `tests/qa_round2_money_test.go`, `web/apps/app/tests/qa-round2-money.test.mjs` |
| No collection date after today (Africa/Johannesburg) | `parseDay`, `checkCollectionDate` in `internal/services/transactions/parse.go`, `today()` in `web/apps/app/src/lib/format.ts`, tests in `tests/qa_round2_collections_test.go` |
| File names a person chose keep their case (`CleanName`); `SafeName` still lowercases | `internal/platform/storage/storage.go` |
| QA round 2 job A web tests (collections, trade, stock, market, copy) | `web/apps/app/tests/qa-round2-{collections,trade,stock,market,copy}.test.mjs` |
| One kg rule (thousands spaces, 2 decimals at most) and one CO₂e line built on it; phone grouping | `formatKgNumber`, `formatKg`, `formatPhone` in `web/apps/app/src/lib/format.ts`, `formatCo2` in `src/lib/impact.ts` |
| "[removed]" marker shown as "Message removed"; staff see "You can't open this chat" with no retry | `messageText` in `src/components/chat/helpers.ts`, `ChatBlocked` in `src/components/chat/messages-layout.tsx` |
| Collector email unique per business, case-insensitive (service check, no index) | `EmailConflict` in `internal/stores/collectors/collectors.go`, `Save` in `internal/services/collectors/collectors.go` |
| QA round 3 job B tests | `tests/qa_round3_collectors_test.go`, `web/apps/app/tests/qa-round3-shell.test.mjs` |
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

## Stock photos and store logos

| Job | Owner |
| --- | --- |
| Owner photo upload/removal and private cached photo stream | `internal/api/stock/image.go` |
| Stock photo ownership, replacement compensation and after-commit cleanup | `internal/services/stock/image.go`; stock deletion in `stock.go` |
| Market-visible photo reads and owner image reference writes | `internal/stores/stock/image.go` |
| Versioned listing photo and seller logo projections | `internal/stores/market/listings.go`; stock photo projection in `internal/stores/stock/stock.go` |
| Read stock photo keys before account erase and include them in own exports | `internal/stores/privacy/{erase,export}.go`; after-commit cleanup in `internal/services/privacy/erase.go` |
| Shared picture avatar with initials fallback | `web/apps/app/src/components/visuals.tsx` (`PersonAvatar`) |
| Edit-only stock photo selection, preview and staged removal | `web/apps/app/src/components/dialogs/stock-dialog.tsx`; hooks in `src/lib/api/stock.ts` |
| Marketplace card photos and seller logos, smaller listing gallery | `web/apps/app/src/components/listing-card.tsx`, `src/routes/market/listing/-components/gallery.tsx` |
| Stock photo access, visibility, replacement, rollback, privacy and live routing tests | `tests/stock_images_test.go`, `tests/stock_images_live_test.go` |
| Photo/placeholder, avatar, stock photo validation and staged-save web tests | `web/apps/app/tests/stock-images.test.mjs` |
