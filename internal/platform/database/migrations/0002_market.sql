-- The marketplace tables. Money and weights are numeric, never float.

-- People who sell but never sign in. Recorded by staff, admin or a business.
CREATE TABLE collectors (
  id                       text PRIMARY KEY,
  name                     text NOT NULL,
  email                    text,
  phone                    text NOT NULL,
  normalized_phone         text NOT NULL,
  image                    text,
  bank_account_holder_name text,
  bank_name                text,
  bank_account_number      text,
  bank_branch_code         text,
  bank_account_type        text CHECK (bank_account_type IN ('Cheque', 'Savings', 'Transmission')),
  payout_method            text CHECK (payout_method IN ('bank', 'ewallet')),
  ewallet_platform_name    text,
  ewallet_payment_id       text,
  street_address           text,
  city                     text,
  area_code                integer,
  province                 text CHECK (province IN (
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
    'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
  )),
  created_by_user_id       text NOT NULL REFERENCES users (id),
  created_by_business_id   text REFERENCES users (id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX collectors_normalized_phone_key ON collectors (normalized_phone);
CREATE INDEX collectors_created_by_idx ON collectors (created_by_user_id);

CREATE TABLE materials (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  carbon_factor numeric NOT NULL,
  gw_code       text NOT NULL,
  -- Base (minimum) price per kg.
  price         numeric NOT NULL CHECK (price >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock (
  id          text PRIMARY KEY,
  owner_id    text NOT NULL REFERENCES users (id),
  -- A material in use cannot be deleted from under its stock.
  material_id text NOT NULL REFERENCES materials (id),
  weight      numeric NOT NULL CHECK (weight >= 0),
  price       numeric NOT NULL CHECK (price >= 0),
  is_listed   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stock_owner_idx ON stock (owner_id);
CREATE INDEX stock_material_idx ON stock (material_id);
CREATE INDEX stock_owner_material_idx ON stock (owner_id, material_id);
CREATE INDEX stock_owner_listed_idx ON stock (owner_id, is_listed);
CREATE INDEX stock_listed_idx ON stock (is_listed) WHERE is_listed;

CREATE TABLE transactions (
  id                 text PRIMARY KEY,
  -- A users id for b2b and a collectors id for c2b, so no foreign key.
  seller_id          text NOT NULL,
  buyer_id           text NOT NULL REFERENCES users (id),
  type               text NOT NULL CHECK (type IN ('c2b', 'b2b')),
  total_price        numeric NOT NULL,
  collection_day     date,
  collection_date    timestamptz,
  -- Object key of the current invoice PDF in MinIO or S3.
  invoice_key        text,
  -- The collector's details frozen at sale time (c2b only).
  collector_snapshot jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transactions_seller_idx ON transactions (seller_id);
CREATE INDEX transactions_buyer_idx ON transactions (buyer_id);
CREATE INDEX transactions_type_idx ON transactions (type);
CREATE INDEX transactions_seller_type_idx ON transactions (seller_id, type);
CREATE INDEX transactions_buyer_type_idx ON transactions (buyer_id, type);
CREATE INDEX transactions_created_idx ON transactions (created_at DESC);

CREATE TABLE transaction_items (
  transaction_id text NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  position       integer NOT NULL,
  material_id    text NOT NULL REFERENCES materials (id),
  weight         numeric NOT NULL,
  price          numeric NOT NULL,
  PRIMARY KEY (transaction_id, position)
);

CREATE INDEX transaction_items_material_idx ON transaction_items (material_id);

-- Photos of paid receipts, at most 5 per transaction (enforced in code).
CREATE TABLE transaction_receipts (
  id             text PRIMARY KEY,
  transaction_id text NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  object_key     text NOT NULL,
  file_name      text NOT NULL,
  content_type   text NOT NULL,
  size           bigint NOT NULL CHECK (size > 0),
  checksum       text,
  uploaded_by    text NOT NULL REFERENCES users (id),
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transaction_receipts_tx_idx ON transaction_receipts (transaction_id);
CREATE UNIQUE INDEX transaction_receipts_checksum_key
  ON transaction_receipts (transaction_id, checksum) WHERE checksum IS NOT NULL;

CREATE TABLE transaction_requests (
  id         text PRIMARY KEY,
  seller_id  text NOT NULL REFERENCES users (id),
  buyer_id   text NOT NULL REFERENCES users (id),
  status     text NOT NULL CHECK (status IN ('pending', 'offered', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (seller_id <> buyer_id)
);

CREATE INDEX transaction_requests_seller_idx ON transaction_requests (seller_id);
CREATE INDEX transaction_requests_buyer_idx ON transaction_requests (buyer_id);
CREATE INDEX transaction_requests_status_idx ON transaction_requests (status);

-- The old single-item fields (materialId, offerWeight, offerPrice) become
-- one row here when migrated, with stock_id empty.
CREATE TABLE transaction_request_items (
  request_id   text NOT NULL REFERENCES transaction_requests (id) ON DELETE CASCADE,
  position     integer NOT NULL,
  material_id  text NOT NULL REFERENCES materials (id),
  stock_id     text REFERENCES stock (id) ON DELETE SET NULL,
  offer_weight numeric,
  offer_price  numeric,
  PRIMARY KEY (request_id, position)
);

CREATE TABLE transaction_request_messages (
  id         text PRIMARY KEY,
  request_id text NOT NULL REFERENCES transaction_requests (id) ON DELETE CASCADE,
  sender_id  text NOT NULL REFERENCES users (id),
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transaction_request_messages_request_idx
  ON transaction_request_messages (request_id, created_at);

CREATE TABLE notifications (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN (
    'request_received', 'request_accepted', 'request_rejected', 'request_cancelled',
    'message_received', 'stock_listed', 'stock_unlisted'
  )),
  title      text NOT NULL,
  body       text NOT NULL,
  link       text,
  read       boolean NOT NULL DEFAULT false,
  dismissed  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON notifications (user_id, dismissed, created_at DESC);

CREATE TABLE carts (
  id         text PRIMARY KEY,
  buyer_id   text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seller_id  text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One cart per buyer and seller; the old code only hoped for this.
  UNIQUE (buyer_id, seller_id)
);

CREATE TABLE cart_items (
  cart_id     text NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
  stock_id    text NOT NULL REFERENCES stock (id) ON DELETE CASCADE,
  material_id text NOT NULL REFERENCES materials (id),
  PRIMARY KEY (cart_id, stock_id)
);

CREATE TABLE store_reviews (
  id             text PRIMARY KEY,
  seller_id      text NOT NULL REFERENCES users (id),
  buyer_id       text NOT NULL REFERENCES users (id),
  -- One review per transaction (the old code only checked in app code).
  transaction_id text NOT NULL UNIQUE REFERENCES transactions (id),
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX store_reviews_seller_idx ON store_reviews (seller_id, created_at DESC);
