-- A buyer posts what they want to buy. Verified sellers reply with an offer,
-- and each reply is an ordinary request with its own chat.
CREATE TABLE wanted_posts (
  id          text PRIMARY KEY,
  buyer_id    text NOT NULL REFERENCES businesses (id),
  material_id text NOT NULL REFERENCES materials (id),
  weight      numeric NOT NULL CHECK (weight > 0),
  max_price   numeric CHECK (max_price >= 0),
  -- A rough area the buyer typed. Never the street address or the map point.
  area        text NOT NULL CHECK (char_length(area) BETWEEN 1 AND 120),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'closed')),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seller discovery: open posts, newest first.
CREATE INDEX wanted_posts_open_idx ON wanted_posts (created_at DESC, id DESC) WHERE status = 'open';

-- The buyer's own list.
CREATE INDEX wanted_posts_buyer_idx ON wanted_posts (buyer_id, created_at DESC, id DESC);

ALTER TABLE transaction_requests
  ADD COLUMN wanted_post_id text REFERENCES wanted_posts (id),
  -- Each seller replies to a post once.
  ADD CONSTRAINT transaction_requests_wanted_seller_key UNIQUE (wanted_post_id, seller_id);

-- Posts are public to every signed-in person (the web only asks verified
-- sellers), so the event goes to all of them and carries only the post id.
CREATE FUNCTION notify_wanted_post() RETURNS trigger AS $$
DECLARE rec record;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
  PERFORM realtime_send('wanted', rec.id, TG_OP, ARRAY[rec.buyer_id], 'all');
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON wanted_posts
FOR EACH ROW EXECUTE FUNCTION notify_wanted_post();
