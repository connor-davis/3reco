-- Index inbox order without finding and sorting every chat's last message.
ALTER TABLE transaction_requests ADD COLUMN activity_at timestamptz NOT NULL DEFAULT now();

UPDATE transaction_requests r SET activity_at = COALESCE(
  (SELECT max(created_at) FROM transaction_request_messages WHERE request_id = r.id),
  r.created_at
);

CREATE INDEX requests_activity_idx ON transaction_requests (activity_at DESC, id DESC);
CREATE INDEX requests_buyer_activity_idx ON transaction_requests (buyer_id, activity_at DESC, id DESC);
CREATE INDEX requests_seller_activity_idx ON transaction_requests (seller_id, activity_at DESC, id DESC);

-- Updating the request also broadcasts to both inboxes and admin:requests.
-- One subscription now covers messages even in chats not loaded yet.
CREATE FUNCTION notify_chat_message() RETURNS trigger AS $$
DECLARE
  req text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- GREATEST uses the locked row's value, so concurrent sends cannot move
    -- activity backwards while waiting for each other's request lock.
    UPDATE transaction_requests SET activity_at = GREATEST(activity_at, NEW.created_at)
      WHERE id = NEW.request_id;
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN req := OLD.request_id; ELSE req := NEW.request_id; END IF;

  UPDATE transaction_requests r SET activity_at = COALESCE(
    (SELECT created_at FROM transaction_request_messages
      WHERE request_id = req ORDER BY created_at DESC, id DESC LIMIT 1),
    r.created_at
  ) WHERE r.id = req;

  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER realtime ON transaction_request_messages;
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON transaction_request_messages
  FOR EACH ROW EXECUTE FUNCTION notify_chat_message();
