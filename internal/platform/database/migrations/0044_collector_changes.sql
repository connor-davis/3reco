-- A business may only change a collector it created straight away. When another
-- business edits one, the edit waits here for staff to approve or reject it.
--
-- The proposed values sit in columns named like the collector's own, so the
-- audit log masks them the same way (audit_mask works by column name). A NULL
-- column means "this field is not part of the change"; an empty string means
-- "clear it". The two payout numbers are sealed by the app, exactly like the
-- collector's, and their last four digits sit beside them for the staff queue.
CREATE TABLE collector_changes (
  id text PRIMARY KEY,
  collector_id text NOT NULL REFERENCES collectors(id) ON DELETE CASCADE,
  business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  acting_user_id text REFERENCES users(id) ON DELETE SET NULL,
  -- 'replaced' is an old request the same business sent again.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'replaced')),
  name text,
  email text,
  phone text,
  image text,
  bank_account_holder_name text,
  bank_name text,
  bank_account_number text,
  bank_branch_code text,
  bank_account_type text,
  payout_method text,
  ewallet_platform_name text,
  ewallet_payment_id text,
  street_address text,
  city text,
  province text,
  area_code integer,
  bank_account_last4 text,
  ewallet_payment_id_last4 text,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text REFERENCES users(id) ON DELETE SET NULL
);

-- One waiting request per collector and business; a new one replaces the old.
CREATE UNIQUE INDEX collector_changes_pending_idx
  ON collector_changes (collector_id, business_id) WHERE status = 'pending';
CREATE INDEX collector_changes_queue_idx ON collector_changes (status, created_at, id);

-- The staff queue hears every change; the proposing business hears its own.
CREATE FUNCTION notify_collector_change() RETURNS trigger AS $$
DECLARE rec record;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
  PERFORM realtime_send('collector_change', rec.id, TG_OP, ARRAY[rec.business_id], 'staff');
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON collector_changes
  FOR EACH ROW EXECUTE FUNCTION notify_collector_change();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON collector_changes
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'request_received', 'request_accepted', 'request_rejected', 'request_cancelled',
  'message_received', 'stock_listed', 'stock_unlisted', 'business_verified',
  'cart_expired', 'store_new_listing', 'saved_search_match', 'report_closed',
  'collector_change'
));
