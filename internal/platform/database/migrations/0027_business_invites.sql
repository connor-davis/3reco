CREATE TABLE business_invites (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(id),
  email text NOT NULL CHECK (email=lower(email)),
  role text NOT NULL CHECK (role IN ('owner','manager','member')),
  token_hash text NOT NULL UNIQUE,
  invited_by text REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX business_invites_live_key ON business_invites(business_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON business_invites
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');

CREATE OR REPLACE FUNCTION notify_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM realtime_send('membership', OLD.user_id, 'update', ARRAY[OLD.user_id]);
    PERFORM realtime_send('team', OLD.business_id, TG_OP, ARRAY[OLD.business_id]);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM realtime_send('membership', NEW.user_id, 'update', ARRAY[NEW.user_id]);
    PERFORM realtime_send('team', NEW.business_id, TG_OP, ARRAY[NEW.business_id]);
  END IF;

  RETURN NULL;
END $$;

CREATE FUNCTION notify_business_invite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM realtime_send('team', OLD.business_id, TG_OP, ARRAY[OLD.business_id]);
  ELSE
    PERFORM realtime_send('team', NEW.business_id, TG_OP, ARRAY[NEW.business_id]);
  END IF;

  RETURN NULL;
END $$;
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON business_invites
  FOR EACH ROW EXECUTE FUNCTION notify_business_invite();
