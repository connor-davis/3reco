-- Up to eight photos per stock item. Position 1 is the cover.
-- stock.image_key stays for now: nothing reads it any more, and a later
-- migration drops it once this release is safely live.
CREATE TABLE stock_photos (
  id         text PRIMARY KEY,
  stock_id   text NOT NULL REFERENCES stock(id) ON DELETE CASCADE,
  position   integer NOT NULL CHECK (position BETWEEN 1 AND 8),
  -- Named object_key so the audit log already masks it.
  object_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Deferred so a reorder can swap positions inside one transaction.
  UNIQUE (stock_id, position) DEFERRABLE INITIALLY DEFERRED
);

-- The old single photo becomes photo 1, so nothing is lost.
INSERT INTO stock_photos (id, stock_id, position, object_key)
SELECT id || '-1', id, 1, image_key FROM stock WHERE image_key IS NOT NULL;

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON stock_photos
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');

-- A photo change wakes the owner's stock list and, for a listed item, the market.
CREATE FUNCTION notify_stock_photo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner  text;
  listed boolean;
  rec    record;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;

  SELECT owner_id, is_listed INTO owner, listed FROM stock WHERE id = rec.stock_id;

  -- The stock row is already gone: its own delete event told everyone.
  IF owner IS NULL THEN RETURN NULL; END IF;

  PERFORM realtime_send('stock', rec.stock_id, 'update', ARRAY[owner]);

  IF listed THEN
    PERFORM realtime_send('listing', rec.stock_id, 'update', '{}', 'all');
  END IF;

  RETURN NULL;
END $$;

CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON stock_photos
  FOR EACH ROW EXECUTE FUNCTION notify_stock_photo();
