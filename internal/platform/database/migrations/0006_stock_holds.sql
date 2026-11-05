-- Physical inventory stays in stock; offers reserve it until accepted or released.
CREATE TABLE stock_holds (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES transaction_requests(id) ON DELETE CASCADE,
  request_item_position integer NOT NULL,
  stock_id text REFERENCES stock(id) ON DELETE SET NULL,
  seller_id text NOT NULL REFERENCES users(id),
  buyer_id text NOT NULL REFERENCES users(id),
  weight numeric NOT NULL CHECK (weight > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'consumed')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  consumed_at timestamptz
);

CREATE UNIQUE INDEX stock_holds_active_item_idx
  ON stock_holds(request_id, request_item_position) WHERE status = 'active';
CREATE INDEX stock_holds_available_idx ON stock_holds(stock_id, expires_at) WHERE status = 'active';
CREATE INDEX stock_holds_request_idx ON stock_holds(request_id) WHERE status = 'active';

CREATE FUNCTION stock_held(stock_row text) RETURNS numeric AS $$
  SELECT COALESCE(sum(weight), 0) FROM stock_holds
  WHERE stock_id = stock_row AND status = 'active' AND expires_at > clock_timestamp()
$$ LANGUAGE sql VOLATILE;

CREATE FUNCTION stock_available(stock_row text, physical numeric) RETURNS numeric AS $$
  SELECT GREATEST(physical - stock_held(stock_row), 0)
$$ LANGUAGE sql VOLATILE;

-- Match the existing change envelope: identifiers and topics only.
CREATE FUNCTION notify_stock_hold() RETURNS trigger AS $$
DECLARE
  rec record;
  topics text[];
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;

  topics := ARRAY['market', 'stock:' || rec.seller_id, 'request:' || rec.request_id];
  topics := array_append(topics, 'requests:' || rec.seller_id);
  topics := array_append(topics, 'requests:' || rec.buyer_id);

  PERFORM pg_notify('threereco_changes',
    json_build_object('id', rec.request_id, 'topics', topics)::text);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON stock_holds
  FOR EACH ROW EXECUTE FUNCTION notify_stock_hold();
