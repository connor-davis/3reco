-- Indexes that match the sort of each hot list, so a page reads its rows in
-- order instead of sorting them. Old indexes that a new one covers are dropped.

-- Default market order (newest listed stock first).
CREATE INDEX stock_market_created_idx ON stock (created_at DESC, id DESC) WHERE is_listed;

-- Owner stock list; also covers every lookup by owner alone.
CREATE INDEX stock_owner_created_idx ON stock (owner_id, created_at DESC, id DESC);
-- Store directory: the listed, non-empty stock of a page of owners.
CREATE INDEX stock_store_idx ON stock (owner_id, material_id) WHERE is_listed AND weight > 0;
DROP INDEX stock_owner_idx;
DROP INDEX stock_listed_idx;

-- Transaction lists by buyer, by seller and type, and for everyone.
CREATE INDEX transactions_buyer_created_idx ON transactions (buyer_id, created_at DESC, id DESC);
CREATE INDEX transactions_seller_type_created_idx
  ON transactions (seller_id, type, created_at DESC, id DESC);
CREATE INDEX transactions_created_id_idx ON transactions (created_at DESC, id DESC);
DROP INDEX transactions_buyer_idx;
DROP INDEX transactions_seller_idx;
DROP INDEX transactions_created_idx;

-- Request lists by participant.
CREATE INDEX transaction_requests_seller_created_idx
  ON transaction_requests (seller_id, created_at DESC, id DESC);
CREATE INDEX transaction_requests_buyer_created_idx
  ON transaction_requests (buyer_id, created_at DESC, id DESC);
DROP INDEX transaction_requests_seller_idx;
DROP INDEX transaction_requests_buyer_idx;

-- Chat pages read oldest first; the inbox reads the newest message by scanning
-- the same index backwards.
CREATE INDEX transaction_request_messages_thread_idx
  ON transaction_request_messages (request_id, created_at, id);
DROP INDEX transaction_request_messages_request_idx;
DROP INDEX transaction_request_messages_latest_idx;

-- Notification list, and a small index for the unread badge count.
CREATE INDEX notifications_user_created_idx
  ON notifications (user_id, dismissed, created_at DESC, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE NOT dismissed AND NOT read;
DROP INDEX notifications_user_idx;

-- Admin and store directory order.
CREATE INDEX users_created_idx ON users (created_at DESC, id DESC) WHERE NOT is_removed;
