-- Verifying a business changes what everyone sees: store pages, listings and the
-- Unverified mark on trades. 0021 only told the business itself, so other open
-- apps stayed stale. This adds the market and trade events for everyone. Only
-- kind, id and op are sent, never row data, so 'all' is safe.
CREATE FUNCTION notify_business_verified() RETURNS trigger AS $$
BEGIN
  IF OLD.business_verified_at IS NOT DISTINCT FROM NEW.business_verified_at THEN
    RETURN NULL;
  END IF;

  PERFORM realtime_send('listing', NEW.id, 'update', '{}', 'all');
  PERFORM realtime_send('transaction', NEW.id, 'update', '{}', 'all');

  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER business_verified_notify AFTER UPDATE OF business_verified_at
  ON users FOR EACH ROW EXECUTE FUNCTION notify_business_verified();
