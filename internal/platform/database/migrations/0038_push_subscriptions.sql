-- Phone alerts (web push). One row per browser a person switched alerts on in.
-- The endpoint is the browser's own address at its push service, so it is
-- unique: a browser re-subscribed by another person moves to that person.

CREATE TABLE push_subscriptions (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id, created_at DESC);
