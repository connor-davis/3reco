-- An admin verifies a business before it may see and edit every collector.
-- Both columns are empty for everyone until an admin sets them.
ALTER TABLE users
  ADD COLUMN business_verified_at timestamptz,
  ADD COLUMN business_verified_by text REFERENCES users (id) ON DELETE SET NULL;

-- The audit log gets one more kind for verifying or un-verifying a business.
ALTER TABLE privacy_events DROP CONSTRAINT privacy_events_kind_check;
ALTER TABLE privacy_events ADD CONSTRAINT privacy_events_kind_check
  CHECK (kind IN ('export', 'delete', 'admin_full_view', 'business_verify'));

-- A verification change sends the user event, so the business's open app
-- reloads its session and collector list at once. Built on 0020's function.
CREATE OR REPLACE FUNCTION notify_change() RETURNS trigger AS $$
DECLARE
  rec        record;
  buyer      text;
  listeners  text[];
  was_listed boolean := false;
  op         text := lower(TG_OP);
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;

  CASE TG_TABLE_NAME
    WHEN 'notifications' THEN
      PERFORM realtime_send('notification', rec.id, op, ARRAY[rec.user_id]);

    WHEN 'stock' THEN
      PERFORM realtime_send('stock', rec.id, op, ARRAY[rec.owner_id]);

      IF TG_OP <> 'INSERT' THEN was_listed := OLD.is_listed; END IF;

      -- The public market only changes when a listed row appears, changes or goes.
      IF was_listed OR (TG_OP <> 'DELETE' AND NEW.is_listed) THEN
        PERFORM realtime_send('listing', rec.id, op, '{}', 'all');
      END IF;

    WHEN 'carts' THEN
      PERFORM realtime_send('cart', rec.id, op, ARRAY[rec.buyer_id]);

    WHEN 'cart_items' THEN
      SELECT buyer_id INTO buyer FROM carts WHERE id = rec.cart_id;

      -- The cart is already gone when its items go with it; the carts trigger spoke.
      IF buyer IS NULL THEN RETURN NULL; END IF;

      PERFORM realtime_send('cart', rec.cart_id, op, ARRAY[buyer]);

    WHEN 'transaction_requests' THEN
      listeners := ARRAY[rec.seller_id, rec.buyer_id];

      IF TG_OP = 'UPDATE' THEN
        listeners := listeners || ARRAY[OLD.seller_id, OLD.buyer_id];

        -- A chat message only moves activity_at (0011). Staff cannot read
        -- chats, so that kind of change goes to the two people and admins.
        IF to_jsonb(OLD) - 'activity_at' = to_jsonb(NEW) - 'activity_at' THEN
          PERFORM realtime_send('request', rec.id, op, listeners, 'admin');
          RETURN NULL;
        END IF;
      END IF;

      PERFORM realtime_send('request', rec.id, op, listeners, 'staff');

    WHEN 'transactions' THEN
      listeners := transaction_listeners(rec.type, rec.buyer_id, rec.seller_id);

      PERFORM realtime_send('transaction', rec.id, op, listeners, 'staff');

    WHEN 'transaction_receipts' THEN
      SELECT transaction_listeners(t.type, t.buyer_id, t.seller_id) INTO listeners
        FROM transactions t WHERE t.id = rec.transaction_id;

      -- The transaction is already gone when its receipts go with it.
      IF listeners IS NULL THEN RETURN NULL; END IF;

      PERFORM realtime_send('transaction', rec.transaction_id, op, listeners, 'staff');

    WHEN 'users' THEN
      -- Admin fields and store logos are live; passwords and terms stay quiet.
      IF TG_OP = 'UPDATE' THEN
        IF (
          OLD.role, OLD.is_removed, OLD.name, OLD.first_name, OLD.last_name,
          OLD.business_name, OLD.email, OLD.profile_complete, OLD.avatar_key,
          OLD.business_verified_at
        ) IS NOT DISTINCT FROM (
          NEW.role, NEW.is_removed, NEW.name, NEW.first_name, NEW.last_name,
          NEW.business_name, NEW.email, NEW.profile_complete, NEW.avatar_key,
          NEW.business_verified_at
        ) THEN
          RETURN NULL;
        END IF;
      END IF;

      PERFORM realtime_send('user', rec.id, op, ARRAY[rec.id], 'admin');

      IF TG_OP = 'UPDATE' AND rec.role = 'business'
        AND OLD.avatar_key IS DISTINCT FROM NEW.avatar_key THEN
        PERFORM realtime_send('listing', rec.id, op, '{}', 'all');
      END IF;

    WHEN 'materials' THEN
      PERFORM realtime_send('material', rec.id, op, '{}', 'all');

    WHEN 'collectors' THEN
      listeners := ARRAY[rec.created_by_business_id] || collector_users(rec.normalized_phone);

      IF TG_OP = 'UPDATE' THEN
        listeners := listeners || ARRAY[OLD.created_by_business_id]
          || collector_users(OLD.normalized_phone);
      END IF;

      PERFORM realtime_send('collector', rec.id, op, listeners, 'staff');

    WHEN 'store_reviews' THEN
      PERFORM realtime_send('review', rec.id, op, '{}', 'all');
  END CASE;

  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER realtime ON users;
CREATE TRIGGER realtime AFTER INSERT OR DELETE OR UPDATE OF
  role, is_removed, name, first_name, last_name, business_name, email, profile_complete, avatar_key,
  business_verified_at
  ON users FOR EACH ROW EXECUTE FUNCTION notify_change();

-- The business is told when it is verified and when that is taken away.
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'request_received', 'request_accepted', 'request_rejected', 'request_cancelled',
  'message_received', 'stock_listed', 'stock_unlisted', 'business_verified'
));
