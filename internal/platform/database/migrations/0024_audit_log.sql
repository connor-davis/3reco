-- Audit log: one line for every insert, update and delete on business data,
-- written by a trigger inside the same transaction as the change. Personal
-- details are masked here in Postgres, so a raw value never reaches the log.
-- Lines are kept 5 years; only the retention job may delete (older) lines.

-- Last four digits of the payout numbers, filled by the app on every write.
-- The numbers themselves are encrypted by the app and cannot be read in SQL,
-- so lists and the audit log show these instead.
ALTER TABLE collectors
  ADD COLUMN bank_account_last4 text,
  ADD COLUMN ewallet_payment_id_last4 text;

CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  -- NULL means the system: a background job, the importer or a sign-up.
  actor_id   text,
  table_name text NOT NULL,
  -- The primary key columns, so composite keys work.
  row_key    jsonb NOT NULL,
  action     text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  -- Masked. On update, only the columns that changed.
  old_values jsonb,
  new_values jsonb
);

CREATE INDEX audit_log_at_idx ON audit_log (at DESC, id DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id);
CREATE INDEX audit_log_table_idx ON audit_log (table_name);

-- audit_mask hides personal details in a row before it is logged. Every
-- column list lives here, in one place. A new sensitive column goes in a list.
CREATE FUNCTION audit_mask(table_name text, row_json jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  -- Never logged: secrets, object keys (files, images) and street addresses.
  -- City and province stay.
  drop_cols  constant text[] := ARRAY[
    'password_hash', 'token_hash', 'avatar_key', 'image_key', 'object_key',
    'invoice_key', 'image', 'street_address'];
  -- Last four characters only: "•••• 1234". An encrypted value ("v1:...")
  -- cannot be read here, so it shows "••••".
  last4_cols constant text[] := ARRAY[
    'bank_account_number', 'bank_branch_code', 'ewallet_payment_id',
    'id_number', 'business_registration_number'];
  -- Already only the last four, kept by the app next to an encrypted number.
  stored4_cols constant text[] := ARRAY['bank_account_last4', 'ewallet_payment_id_last4'];
  phone_cols constant text[] := ARRAY['phone', 'normalized_phone'];
  email_cols constant text[] := ARRAY['email'];
  masked jsonb := '{}'::jsonb;
  col record;
  txt text;
BEGIN
  IF row_json IS NULL THEN
    RETURN NULL;
  END IF;

  FOR col IN SELECT key, value FROM jsonb_each(row_json) LOOP
    CONTINUE WHEN col.key = ANY(drop_cols);

    txt := CASE WHEN jsonb_typeof(col.value) = 'string' THEN col.value #>> '{}' END;

    masked := masked || jsonb_build_object(col.key, CASE
      -- The frozen collector copy on a trade holds the same fields.
      WHEN col.key = 'collector_snapshot' AND jsonb_typeof(col.value) = 'object'
        THEN audit_mask(table_name, col.value)
      -- A chat message body is never logged, only that a message changed.
      WHEN table_name = 'transaction_request_messages' AND col.key = 'content'
        AND txt IS NOT NULL
        THEN to_jsonb('[message of ' || length(txt) || ' characters]')
      WHEN txt IS NULL THEN col.value
      WHEN col.key = ANY(last4_cols) THEN to_jsonb(CASE
        WHEN txt = '' THEN ''
        WHEN txt LIKE 'v1:%' OR length(txt) <= 4 THEN '••••'
        ELSE '•••• ' || right(txt, 4) END)
      WHEN col.key = ANY(stored4_cols) THEN to_jsonb(CASE
        WHEN txt = '' THEN '' ELSE '•••• ' || txt END)
      WHEN col.key = ANY(phone_cols) THEN to_jsonb(
        '••• ••• ' || right(regexp_replace(txt, '\D', '', 'g'), 4))
      WHEN col.key = ANY(email_cols) THEN to_jsonb(CASE
        WHEN position('@' IN txt) > 1
          THEN left(txt, 1) || '***@' || split_part(txt, '@', 2)
        ELSE '***' END)
      ELSE col.value END);
  END LOOP;

  RETURN masked;
END $$;

-- audit_row writes the audit line. The trigger names the primary key columns
-- as arguments. The actor comes from app.actor_id, which the app sets for the
-- transaction; COALESCE because an unset setting is NULL, not ''.
CREATE FUNCTION audit_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor text := NULLIF(COALESCE(current_setting('app.actor_id', true), ''), '');
  -- Columns that change on almost every save and say nothing by themselves.
  noise constant text[] := ARRAY['updated_at', 'activity_at'];
  old_all jsonb;
  new_all jsonb;
  old_out jsonb;
  new_out jsonb;
  source_row jsonb;
  key_json jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_all := audit_mask(TG_TABLE_NAME, to_jsonb(NEW));
    source_row := to_jsonb(NEW);
    new_out := new_all;
  ELSIF TG_OP = 'DELETE' THEN
    old_all := audit_mask(TG_TABLE_NAME, to_jsonb(OLD));
    source_row := to_jsonb(OLD);
    old_out := old_all;
  ELSE
    old_all := audit_mask(TG_TABLE_NAME, to_jsonb(OLD));
    new_all := audit_mask(TG_TABLE_NAME, to_jsonb(NEW));
    source_row := to_jsonb(NEW);

    -- Only the columns that differ once masked. Nothing differs: no line.
    SELECT jsonb_object_agg(k, old_all -> k), jsonb_object_agg(k, new_all -> k)
      INTO old_out, new_out
    FROM (SELECT k FROM jsonb_object_keys(old_all || new_all) AS k
          WHERE k <> ALL(noise) AND (old_all -> k) IS DISTINCT FROM (new_all -> k)) AS changed;

    IF old_out IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT jsonb_object_agg(k, source_row -> k) INTO key_json FROM unnest(TG_ARGV) AS k;

  INSERT INTO audit_log (actor_id, table_name, row_key, action, old_values, new_values)
  VALUES (actor, TG_TABLE_NAME, key_json, lower(TG_OP), old_out, new_out);

  RETURN NULL;
END $$;

-- Lines cannot be changed, and can only be deleted once they are 5 years old,
-- which is the retention job's delete. Nobody else can remove history.
CREATE FUNCTION audit_log_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.at < now() - interval '5 years' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'The audit log cannot be changed.';
END $$;

CREATE TRIGGER audit_log_guard BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_guard();

CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_guard();

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON collectors
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON materials
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON stock
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON transaction_items
  FOR EACH ROW EXECUTE FUNCTION audit_row('transaction_id', 'position');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON transaction_receipts
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON transaction_requests
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON transaction_request_items
  FOR EACH ROW EXECUTE FUNCTION audit_row('request_id', 'position');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON transaction_request_messages
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON store_reviews
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON privacy_notice_acceptances
  FOR EACH ROW EXECUTE FUNCTION audit_row('user_id', 'version');
