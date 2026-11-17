-- Searches belong to a person, including people who share a business.
CREATE TABLE saved_searches (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  material_id text NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
  min_price   numeric CHECK (min_price >= 0),
  max_price   numeric CHECK (max_price >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (min_price IS NULL OR max_price IS NULL OR min_price <= max_price)
);

CREATE INDEX saved_searches_user_idx ON saved_searches (user_id, created_at DESC, id DESC);
CREATE INDEX saved_searches_material_idx ON saved_searches (material_id);

CREATE FUNCTION notify_saved_search() RETURNS trigger AS $$
DECLARE rec record;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
  PERFORM realtime_send('saved_search', rec.id, TG_OP, ARRAY[rec.user_id]);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON saved_searches
FOR EACH ROW EXECUTE FUNCTION notify_saved_search();

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'request_received', 'request_accepted', 'request_rejected', 'request_cancelled',
  'message_received', 'stock_listed', 'stock_unlisted', 'business_verified',
  'cart_expired', 'store_new_listing', 'saved_search_match'
));
