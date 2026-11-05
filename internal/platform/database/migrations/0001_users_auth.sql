-- Users, sessions and one-time tokens. Better Auth's user and account tables
-- are merged into users: one row per person, password hash on the row.
-- Ids are text. Migrated rows keep their Convex id; new rows get a random
-- lowercase 32-character id from database.NewID.

CREATE TABLE users (
  id                           text PRIMARY KEY,
  email                        text,
  email_verified               boolean NOT NULL DEFAULT false,
  email_verified_at            timestamptz,
  -- Argon2id ("$argon2id$...") for new hashes; "<saltHex>:<keyHex>" for
  -- Better Auth scrypt hashes that have not been rehashed yet.
  password_hash                text,
  name                         text NOT NULL DEFAULT '',
  image                        text,
  phone                        text,
  normalized_phone             text,
  role                         text CHECK (role IN ('admin', 'staff', 'business', 'collector')),
  profile_complete             boolean NOT NULL DEFAULT false,
  agreed_to_terms              boolean NOT NULL DEFAULT false,
  first_name                   text,
  last_name                    text,
  id_number                    text,
  business_name                text,
  business_registration_number text,
  bank_account_holder_name     text,
  bank_name                    text,
  bank_account_number          text,
  bank_branch_code             text,
  bank_account_type            text CHECK (bank_account_type IN ('Cheque', 'Savings', 'Transmission')),
  street_address               text,
  city                         text,
  area_code                    integer,
  province                     text CHECK (province IN (
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
    'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
  )),
  is_removed                   boolean NOT NULL DEFAULT false,
  removed_at                   timestamptz,
  removed_by                   text REFERENCES users (id),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

-- One account per email, ignoring case. Removed users have no email.
CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX users_role_idx ON users (role);
CREATE INDEX users_normalized_phone_idx ON users (normalized_phone);

-- A browser session. Only the hash of the cookie token is stored.
CREATE TABLE sessions (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  ip           text NOT NULL DEFAULT '',
  user_agent   text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Email verification and password reset links. Only the newest link of each
-- kind works, and each is used once.
CREATE TABLE auth_tokens (
  token_hash text PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('verify', 'reset')),
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, kind);

-- Request counts for the rate limit, shared by every server on this database.
CREATE TABLE rate_counts (
  key   text PRIMARY KEY,
  n     integer NOT NULL,
  until timestamptz NOT NULL
);
