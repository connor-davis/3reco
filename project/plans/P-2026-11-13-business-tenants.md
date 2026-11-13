# Plan: businesses as tenants

Date: 2026-11-13. Source map: `mystuff/maps/tenants.md`. Status: approved 2026-11-13;
phase 2 implemented and verified locally, awaiting review and delivery.

## Owner decisions

- A person can belong to **many businesses**, with a business switcher.
- Business roles: **Owner** (everything, incl. bank details and people), **Manager** (trades,
  stock, chat, invoices, collectors), **Member** (stock and chat; no bank details, no offers or
  confirmations, no people).
- Chat read state is **shared**: one person reading clears it for the whole business.
- **Collectors stay as they are**: records a business manages, now owned by the business.
- 3REco "staff" stays the platform's own staff. In the app, business people are "team", never
  "staff".

## The core idea (keeps the change small)

1. New table `businesses` holds what is now on a business user: name, registration, bank and
   payout (still encrypted), logo, city/province, verification.
2. **Each existing business keeps its id.** The migration creates one business per business
   user, with `businesses.id = users.id`, and makes that user its Owner. Every party column
   (`stock.owner_id`, request and trade `buyer_id`/`seller_id`, carts, holds, reviews,
   `collectors.created_by_business_id`) already holds that id, so **no trade, invoice or
   snapshot is rewritten**. New businesses get new ids.
3. New table `business_members(business_id, user_id, role)`.
4. The **active business** is stored on the session (`sessions.active_business_id`), set at
   sign-in (the last one used) and by the switcher. Every request and the WebSocket read it from
   the session, so no header has to travel with each call.
5. Access checks compare party ids with the **active business id** (not the user id), then check
   the member's role for the action. Person-level things stay per person: sessions, privacy
   consent, notifications, message authorship, receipt uploader, audit actor.
6. Realtime: a recipient that is a business fans out to its current members; a removed member
   stops getting events at once.
7. Audit log: add `business_id` (from `app.business_id`) next to `actor_id`.

## Phases (each one a PR, each one live before the next)

1. **Foundation, no visible change.** Tables, migration, session active business, all access
   checks and realtime switched to the active business. Every business has one Owner, so the
   app behaves exactly as today. Cross-business tests for every route. *Biggest and riskiest
   phase; it touches every area.*
2. **Team and invites.** "Team" page for Owners: invite by email (dedicated `business_invites`
   records and the existing action mail), resend, revoke, change role, remove. Joining with a
   new or existing account. Role rules enforced on the server.
   **Implemented and verified locally (2026-11-13):** migration 0027, auth helpers,
   business store extensions, owner-only Team service/routes, last-owner guard, seven-day
   invites and realtime close code 4403 are on `cd/feat-tenants-team`. The web includes the
   Team directory and invitations, confirmed role/removal actions, new-account and signed-in
   acceptance, Owner navigation on desktop/phone/search, and live updates without polling.
   A membership loss refetches identity and business data without signing the person out.
   The role-change regression now uses the Manager-only cart action; removal regressions
   prove access to private, unlisted stock before and after removal. In the old round-12
   test, demoting an admin to business creates their own Owner membership, so its Team event
   is legitimate. That test ignores only Team events with that business id. Unrelated admin
   and platform staff sockets are explicitly checked for silence in `TestTeamEventsLive`.
   Targeted backend regressions and the four light/dark phone/desktop Team/invite browser
   combinations pass. The explicit web checks pass: Prettier, ESLint, `tsc -b --noEmit`,
   all 380 tests and the production build. Full `task check` exited 0 using
   `TEST_DB='postgres://threereco:threereco@localhost:5441/postgres?sslmode=disable'`;
   the Go integration suite passed in 500 seconds, followed by all web checks. No Windows
   startup retry was needed. Log: `mystuff/checks/task-check-2.log` in the implementation
   worktree. No PR opened or merge performed.
3. **Switcher and new business.** The workspace chooser moves out of the sidebar (the name and
   "workspace" block under the logo) into the left side of the desktop top bar, which is empty
   today (owner, 2026-11-13). It lists your businesses; switch, or create another. Verification is
   per business.
4. **Shared chat unread.** Read state per business, not per person; unread counts follow.

## Risks

- Phase 1 changes the access rule behind every route. Any missed check is a data leak, so each
  route gets a test that another business can't read or change its data.
- Privacy erase: deleting a person must not delete the business; closing a business is a
  separate action (later).
- Live data: about one owner per business today, so the move is simple, but it still needs a
  backup and a dry run on a copy first.

## Not in this plan

- Collector companies as tenants.
- Moving a business between owners (an Owner can add another Owner instead).
