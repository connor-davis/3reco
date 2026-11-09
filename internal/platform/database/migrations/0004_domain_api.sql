-- Support for the trade routes: inbox read marks, the inbox's latest-message
-- lookup and the public market filter.

-- Who has read which message. A row means "this user has seen this message".
-- The sender's own messages never need a row.
CREATE TABLE request_message_reads (
  message_id text NOT NULL REFERENCES transaction_request_messages (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

-- The inbox asks for the newest message of each request.
CREATE INDEX transaction_request_messages_latest_idx
  ON transaction_request_messages (request_id, created_at DESC, id DESC);

CREATE INDEX stock_market_idx ON stock (material_id, owner_id, id) WHERE is_listed;

-- Same function as 0003 plus one case: a read mark goes to the topic of the
-- request its message belongs to, so the other person's unread dot updates.
CREATE OR REPLACE FUNCTION notify_change() RETURNS trigger AS $$
DECLARE
  rec        record;
  row_id     text;
  topics     text[];
  buyer      text;
  req        text;
  was_listed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;

  -- cart_items and request_message_reads have no id column; their branches set row_id.
  IF TG_TABLE_NAME NOT IN ('cart_items', 'request_message_reads') THEN row_id := rec.id; END IF;

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

    WHEN 'request_message_reads' THEN
      row_id := rec.message_id;

      SELECT request_id INTO req FROM transaction_request_messages WHERE id = rec.message_id;

      -- The message is already gone when its request goes; that trigger spoke.
      IF req IS NULL THEN RETURN NULL; END IF;

      topics := ARRAY['request:' || req];

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

CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON request_message_reads
  FOR EACH ROW EXECUTE FUNCTION notify_change();
