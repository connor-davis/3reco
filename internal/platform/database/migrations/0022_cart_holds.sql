-- A cart line holds its stock for 48 hours. It reuses stock_holds, so
-- stock_held(), stock_available() and every reader count cart holds with no change.
ALTER TABLE stock_holds
  ALTER COLUMN request_id DROP NOT NULL,
  ALTER COLUMN request_item_position DROP NOT NULL,
  ADD COLUMN cart_id text REFERENCES carts (id) ON DELETE CASCADE;

-- A hold belongs to exactly one request line or one cart; the position goes
-- with the request only.
ALTER TABLE stock_holds ADD CONSTRAINT stock_holds_one_owner CHECK (
  (request_id IS NOT NULL) <> (cart_id IS NOT NULL)
  AND (request_id IS NULL) = (request_item_position IS NULL)
);

-- One active hold per cart line. The request index is unchanged: NULL request
-- ids never collide in a unique index.
CREATE UNIQUE INDEX stock_holds_active_cart_idx
  ON stock_holds (cart_id, stock_id) WHERE status = 'active' AND cart_id IS NOT NULL;
CREATE INDEX stock_holds_cart_idx ON stock_holds (cart_id) WHERE status = 'active';

-- A request hold behaves as before. A cart hold changes the buyer's cart, the
-- seller's stock and what the market can buy.
CREATE OR REPLACE FUNCTION notify_stock_hold() RETURNS trigger AS $$
DECLARE
  rec record;
  op  text := lower(TG_OP);
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;

  IF rec.request_id IS NOT NULL THEN
    PERFORM realtime_send('request', rec.request_id, op,
      ARRAY[rec.seller_id, rec.buyer_id], 'staff');
  ELSE
    PERFORM realtime_send('cart', rec.cart_id, op, ARRAY[rec.buyer_id]);
  END IF;

  -- The stock row can be gone already (ON DELETE SET NULL); its trigger spoke.
  IF rec.stock_id IS NOT NULL THEN
    PERFORM realtime_send('stock', rec.stock_id, op, ARRAY[rec.seller_id]);
    PERFORM realtime_send('listing', rec.stock_id, op, '{}', 'all');
  END IF;

  RETURN NULL;
END
$$ LANGUAGE plpgsql;

-- The buyer is told when a cart reservation ran out.
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'request_received', 'request_accepted', 'request_rejected', 'request_cancelled',
  'message_received', 'stock_listed', 'stock_unlisted', 'business_verified',
  'cart_expired'
));
