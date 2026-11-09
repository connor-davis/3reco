-- Live data. Every write to a live table sends one NOTIFY with the row id and
-- the topics that should hear about it. The payload never holds row data: the
-- browser refetches through the authorized REST routes, so nothing leaks.
--
-- Topics (the WebSocket hub checks who may join each one):
--   notifications:<user>  stock:<user>  cart:<user>  transactions:<user>
--   requests:<user>       request:<id>  market      materials
--   admin:users           admin:transactions        admin:requests

CREATE FUNCTION notify_change() RETURNS trigger AS $$
DECLARE
  rec        record;
  row_id     text;
  topics     text[];
  buyer      text;
  was_listed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;

  -- cart_items has no id column; its branch sets row_id itself.
  IF TG_TABLE_NAME <> 'cart_items' THEN row_id := rec.id; END IF;

  CASE TG_TABLE_NAME
    WHEN 'notifications' THEN
      topics := ARRAY['notifications:' || rec.user_id];

    WHEN 'stock' THEN
      topics := ARRAY['stock:' || rec.owner_id];

      IF TG_OP <> 'INSERT' THEN was_listed := OLD.is_listed; END IF;

      -- The public market only changes when a listed row appears, changes or goes.
      IF was_listed OR (TG_OP <> 'DELETE' AND NEW.is_listed) THEN
        topics := array_append(topics, 'market');
      END IF;

    WHEN 'carts' THEN
      topics := ARRAY['cart:' || rec.buyer_id];

    WHEN 'cart_items' THEN
      row_id := rec.cart_id;

      SELECT buyer_id INTO buyer FROM carts WHERE id = rec.cart_id;

      -- The cart is already gone when its items go with it; the carts trigger spoke.
      IF buyer IS NULL THEN RETURN NULL; END IF;

      topics := ARRAY['cart:' || buyer];

    WHEN 'transaction_requests' THEN
      topics := ARRAY[
        'request:' || rec.id,
        'requests:' || rec.seller_id,
        'requests:' || rec.buyer_id,
        'admin:requests'
      ];

    WHEN 'transaction_request_messages' THEN
      row_id := rec.request_id;
      topics := ARRAY['request:' || rec.request_id];

    WHEN 'transactions' THEN
      topics := ARRAY[
        'transactions:' || rec.buyer_id,
        'transactions:' || rec.seller_id,
        'admin:transactions'
      ];

    WHEN 'users' THEN
      topics := ARRAY['admin:users'];

    WHEN 'materials' THEN
      topics := ARRAY['materials'];
  END CASE;

  -- A NOTIFY payload must stay under 8000 bytes; ids and topics are tiny.
  PERFORM pg_notify(
    'threereco_changes',
    json_build_object('id', row_id, 'topics', topics)::text
  );

  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON stock
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON carts
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON transaction_requests
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON transaction_request_messages
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON materials
  FOR EACH ROW EXECUTE FUNCTION notify_change();
