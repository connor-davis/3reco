-- Live data, routed by the server. Every write to a live table sends one
-- NOTIFY: {kind, id, op, users, aud}. The hub turns that into a "changed"
-- event for exactly the people who may see the row. Nothing but ids and a
-- short audience word is sent, never row data, and the payload stays far under
-- the 8000 byte limit (a user id is about 35 bytes; lists are capped).
--
--   kind   what changed: notification, stock, listing, cart, request,
--          transaction, user, material, collector, review
--   users  user ids that hear it (old and new parties on an UPDATE)
--   aud    '' (nobody extra), 'all' (every signed-in user), 'staff' (admins
--          and staff) or 'admin' (admins only)

CREATE FUNCTION realtime_send(
  kind text, row_id text, op text, users text[], aud text DEFAULT ''
) RETURNS void AS $$
  SELECT pg_notify('threereco_changes', json_build_object(
    'kind', kind,
    'id', row_id,
    'op', lower(op),
    'users', ARRAY(SELECT DISTINCT u FROM unnest(users) AS u WHERE u IS NOT NULL),
    'aud', aud
  )::text)
$$ LANGUAGE sql;

-- The sign-in users linked to a collector by phone number, the same link
-- CollectorForUser follows. Capped so a payload can never grow without bound.
CREATE FUNCTION collector_users(linked_phone text) RETURNS text[] AS $$
  SELECT COALESCE(array_agg(id), '{}') FROM (
    SELECT u.id FROM users u
    WHERE linked_phone IS NOT NULL AND u.normalized_phone = linked_phone
      AND u.role = 'collector' AND NOT u.is_removed
    ORDER BY u.id LIMIT 50
  ) linked
$$ LANGUAGE sql STABLE;

-- Who hears a change to one transaction: the buyer, the seller of a business
-- trade, or the linked collector users of a collector sale (c2b stores the
-- collector's id as the seller).
CREATE FUNCTION transaction_listeners(tx_type text, buyer text, seller text) RETURNS text[] AS $$
  SELECT CASE WHEN tx_type = 'b2b' THEN ARRAY[buyer, seller]
    ELSE array_prepend(buyer, collector_users(
      (SELECT c.normalized_phone FROM collectors c WHERE c.id = seller)))
    END
$$ LANGUAGE sql STABLE;

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
      -- Only what the admin list shows wakes anyone. Password, terms, avatar
      -- and other routine writes leave admins alone.
      IF TG_OP = 'UPDATE' THEN
        IF (
          OLD.role, OLD.is_removed, OLD.name, OLD.first_name, OLD.last_name,
          OLD.business_name, OLD.email, OLD.profile_complete
        ) IS NOT DISTINCT FROM (
          NEW.role, NEW.is_removed, NEW.name, NEW.first_name, NEW.last_name,
          NEW.business_name, NEW.email, NEW.profile_complete
        ) THEN
          RETURN NULL;
        END IF;
      END IF;

      PERFORM realtime_send('user', rec.id, op, ARRAY[rec.id], 'admin');

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

-- A hold changes one request, the seller's stock and what the market can buy.
CREATE OR REPLACE FUNCTION notify_stock_hold() RETURNS trigger AS $$
DECLARE
  rec record;
  op  text := lower(TG_OP);
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;

  PERFORM realtime_send('request', rec.request_id, op,
    ARRAY[rec.seller_id, rec.buyer_id], 'staff');

  -- The stock row can be gone already (ON DELETE SET NULL); its trigger spoke.
  IF rec.stock_id IS NOT NULL THEN
    PERFORM realtime_send('stock', rec.stock_id, op, ARRAY[rec.seller_id]);
    PERFORM realtime_send('listing', rec.stock_id, op, '{}', 'all');
  END IF;

  RETURN NULL;
END
$$ LANGUAGE plpgsql;

-- The users trigger keeps its name (the importer switches it off by name) but
-- an UPDATE now only fires for the columns the admin list shows.
DROP TRIGGER realtime ON users;
CREATE TRIGGER realtime AFTER INSERT OR DELETE OR UPDATE OF
  role, is_removed, name, first_name, last_name, business_name, email, profile_complete
  ON users FOR EACH ROW EXECUTE FUNCTION notify_change();

CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON collectors
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON store_reviews
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON transaction_receipts
  FOR EACH ROW EXECUTE FUNCTION notify_change();
