-- POPIA and GDPR controls: which privacy notice a person accepted, a log of
-- who used a privacy right or saw a full ID or account number, and the mark
-- that a trade's personal details were removed after the retention period.

CREATE TABLE privacy_notice_acceptances (
  user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  version     text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, version)
);

-- No payload: only who, about whom, what kind and when. subject_id is plain
-- text (a user or collector id, or empty for a bulk export) so a row
-- outlives the person it is about.
CREATE TABLE privacy_events (
  id         text PRIMARY KEY,
  actor_id   text NOT NULL,
  subject_id text,
  kind       text NOT NULL CHECK (kind IN ('export', 'delete', 'admin_full_view')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX privacy_events_created_idx ON privacy_events (created_at DESC, id DESC);

ALTER TABLE transactions ADD COLUMN anonymised_at timestamptz;
