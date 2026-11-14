ALTER TABLE transactions DROP CONSTRAINT transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('pending', 'complete', 'cancelled', 'duplicate'));
ALTER TABLE transactions
  ADD COLUMN duplicate_of text REFERENCES transactions(id),
  ADD COLUMN duplicate_marked_by text REFERENCES users(id),
  ADD COLUMN duplicate_marked_at timestamptz,
  ADD CONSTRAINT duplicate_state CHECK (
    (status = 'duplicate' AND duplicate_of IS NOT NULL AND duplicate_of <> id
      AND duplicate_marked_by IS NOT NULL AND duplicate_marked_at IS NOT NULL)
    OR (status <> 'duplicate' AND duplicate_of IS NULL
      AND duplicate_marked_by IS NULL AND duplicate_marked_at IS NULL));
CREATE INDEX transactions_duplicate_of ON transactions(duplicate_of)
  WHERE duplicate_of IS NOT NULL;

CREATE TABLE duplicate_dismissals (
  id text PRIMARY KEY,
  trade_ids text[] NOT NULL UNIQUE,
  actor_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER audit AFTER INSERT ON duplicate_dismissals
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');

-- Other admins must see a dismissed group disappear without refreshing.
CREATE FUNCTION duplicate_dismissed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM realtime_send('duplicate', NEW.id, 'insert', ARRAY[]::text[], 'admin');
  RETURN NULL;
END $$;
CREATE TRIGGER realtime AFTER INSERT ON duplicate_dismissals
  FOR EACH ROW EXECUTE FUNCTION duplicate_dismissed();

CREATE TABLE collection_idempotency (
  user_id text NOT NULL REFERENCES users(id),
  key text NOT NULL,
  transaction_id text REFERENCES transactions(id),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (user_id, key)
);
