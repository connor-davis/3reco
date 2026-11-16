-- The request list asks, for every request, "is there a completed trade for
-- it?". Without an index that scans all of transactions once per request. The
-- partial index holds only completed trades, which is all the question needs.
CREATE INDEX IF NOT EXISTS transactions_request_complete_idx
  ON transactions (request_id)
  WHERE status = 'complete';

-- The seller rating is an average over store_reviews.rating. Carrying rating
-- in the index lets Postgres read the average from the index alone, without
-- visiting the table rows.
CREATE INDEX IF NOT EXISTS store_reviews_seller_rating_idx
  ON store_reviews (seller_id) INCLUDE (rating);
