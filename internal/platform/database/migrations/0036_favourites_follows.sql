-- Saved listings (favourites) and followed stores, owned by the person.
-- A store is a business, whose id is also a users id.

-- The first time a row was listed. Followers hear about that moment only.
-- Rows listed today count as already published; unlisted ones stay NULL so
-- their real first publish still tells the followers.
ALTER TABLE stock ADD COLUMN first_listed_at timestamptz;
UPDATE stock SET first_listed_at = created_at WHERE is_listed;

CREATE TABLE favourites (
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  stock_id   text NOT NULL REFERENCES stock (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stock_id)
);

CREATE INDEX favourites_user_idx ON favourites (user_id, created_at DESC, stock_id DESC);

CREATE TABLE follows (
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  store_id   text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);

CREATE INDEX follows_user_idx ON follows (user_id, created_at DESC, store_id DESC);
CREATE INDEX follows_store_idx ON follows (store_id);

-- Every type already allowed, plus the alert a follower gets.
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'request_received', 'request_accepted', 'request_rejected', 'request_cancelled',
  'message_received', 'stock_listed', 'stock_unlisted', 'business_verified',
  'cart_expired', 'store_new_listing'
));
