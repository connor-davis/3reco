ALTER TABLE cart_items ADD COLUMN weight numeric;
UPDATE cart_items i SET weight = GREATEST(s.weight, 1) FROM stock s WHERE s.id = i.stock_id;
ALTER TABLE cart_items ALTER COLUMN weight SET NOT NULL;
ALTER TABLE cart_items ADD CHECK (weight > 0);

ALTER TABLE transaction_request_items
    ADD COLUMN requested_weight numeric CHECK (requested_weight > 0),
    ADD COLUMN requested_price numeric CHECK (requested_price >= 0);

ALTER TABLE transaction_requests
    ADD COLUMN offer_by text REFERENCES users(id),
    ADD COLUMN offer_version integer NOT NULL DEFAULT 0,
    ADD COLUMN buyer_confirmed_version integer,
    ADD COLUMN seller_confirmed_version integer;
UPDATE transaction_requests SET offer_by = seller_id, offer_version = 1 WHERE status = 'offered';

ALTER TABLE transactions ADD COLUMN status text;
UPDATE transactions SET status = 'complete';
ALTER TABLE transactions ALTER COLUMN status SET NOT NULL;
ALTER TABLE transactions ADD CHECK (status IN ('pending', 'complete', 'cancelled'));
ALTER TABLE transactions ADD COLUMN request_id text REFERENCES transaction_requests(id),
    ADD COLUMN offer_version integer;
CREATE UNIQUE INDEX transactions_pending_request ON transactions(request_id) WHERE status = 'pending';
CREATE INDEX transactions_status ON transactions(status, created_at DESC, id DESC);
