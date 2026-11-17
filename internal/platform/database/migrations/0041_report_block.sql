-- Moderation belongs to businesses; the acting person remains in the audit trail.
ALTER TABLE businesses ADD COLUMN suspended_at timestamptz,
  ADD COLUMN suspended_by text REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE blocks (
  id text PRIMARY KEY,
  blocker_id text NOT NULL REFERENCES businesses(id),
  blocked_id text NOT NULL REFERENCES businesses(id),
  acting_user_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks(blocked_id, blocker_id);

CREATE TABLE reports (
  id text PRIMARY KEY,
  reporter_id text NOT NULL REFERENCES businesses(id),
  acting_user_id text NOT NULL REFERENCES users(id),
  listing_id text REFERENCES stock(id) ON DELETE SET NULL,
  party_id text NOT NULL REFERENCES businesses(id),
  target_kind text NOT NULL CHECK (target_kind IN ('listing', 'party')),
  target_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('scam', 'wrong_info', 'offensive', 'spam', 'other')),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'listing_removed', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by text REFERENCES users(id),
  CHECK ((target_kind='listing' AND (listing_id IS NULL OR listing_id=target_id)) OR
    (target_kind='party' AND listing_id IS NULL AND party_id=target_id))
);
CREATE UNIQUE INDEX reports_active_idx ON reports(reporter_id, target_kind, target_id, reason)
  WHERE status='open';
CREATE INDEX reports_queue_idx ON reports(status, created_at, id);
CREATE INDEX reports_reporter_idx ON reports(reporter_id, created_at DESC, id DESC);

-- One predicate serves discovery and contact checks, in both directions.
CREATE FUNCTION contact_allowed(left_party text, right_party text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM businesses
      WHERE id IN (left_party, right_party) AND suspended_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM blocks
      WHERE (blocker_id=left_party AND blocked_id=right_party)
         OR (blocker_id=right_party AND blocked_id=left_party))
$$;

-- Personal alerts must respect every business the recipient belongs to.
CREATE FUNCTION person_contact_allowed(person text, party text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT contact_allowed(person, party) AND NOT EXISTS (
    SELECT 1 FROM business_members WHERE user_id=person
      AND NOT contact_allowed(business_id, party))
$$;

CREATE FUNCTION notify_block() RETURNS trigger AS $$
DECLARE rec record;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
  PERFORM realtime_send('block', rec.id, TG_OP, ARRAY[rec.blocker_id, rec.blocked_id]);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON blocks
  FOR EACH ROW EXECUTE FUNCTION notify_block();

-- Reports deliberately have no realtime trigger.
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON blocks
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON reports
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'request_received', 'request_accepted', 'request_rejected', 'request_cancelled',
  'message_received', 'stock_listed', 'stock_unlisted', 'business_verified',
  'cart_expired', 'store_new_listing', 'saved_search_match', 'report_closed'
));
