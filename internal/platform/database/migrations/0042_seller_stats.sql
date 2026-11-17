-- A signed-in person counts once per listing per Johannesburg calendar day.
-- Keep past days for lifetime totals; deleting stock removes its views.
CREATE TABLE listing_views (
  stock_id text NOT NULL REFERENCES stock(id) ON DELETE CASCADE,
  viewer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  PRIMARY KEY (stock_id, viewer_id, day)
);

CREATE INDEX listing_views_stock_day_idx ON listing_views(stock_id, day);

-- System chat lines count as replies only when their audit insert names the
-- sender as the human actor. Jobs and imported system lines have no actor.
CREATE INDEX audit_message_actor_idx ON audit_log ((row_key->>'id'), actor_id)
  WHERE table_name='transaction_request_messages' AND action='insert' AND actor_id IS NOT NULL;
