-- Quick replies belong to a person and follow them into every chat.
-- The 500-character and 20-reply limits live in the service so the messages stay plain.
CREATE TABLE quick_replies (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (btrim(body) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quick_replies_user_idx ON quick_replies (user_id, created_at, id);
