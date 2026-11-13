-- Last four characters of the encrypted ID and bank account numbers, kept by
-- the app next to the sealed value (Postgres cannot open it), so a masked
-- "•••• 1234" can be built in SQL. Collectors already work this way.
ALTER TABLE users ADD COLUMN bank_account_last4 text, ADD COLUMN id_number_last4 text;
ALTER TABLE businesses ADD COLUMN bank_account_last4 text;

-- The one set of mask shapes. API queries and the audit log both use them.
-- A plain value: "•••• 1234"; sealed ("v1:...") or too short: "••••".
CREATE FUNCTION mask_last4(txt text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN txt IS NULL THEN NULL WHEN txt = '' THEN ''
    WHEN txt LIKE 'v1:%' OR length(txt) <= 4 THEN '••••'
    ELSE '•••• ' || right(txt, 4) END $$;

-- A stored last four (the *_last4 columns): "•••• 1234"; nothing stored: ''.
CREATE FUNCTION mask_stored4(last4 text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN COALESCE(last4, '') = '' THEN '' ELSE '•••• ' || last4 END $$;

-- A sealed number with its stored last four: "•••• 1234". A number too short
-- for a last four still shows "••••", so a form never reads it as empty.
CREATE FUNCTION mask_sealed(sealed text, last4 text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN COALESCE(sealed, '') = '' THEN ''
    ELSE COALESCE(NULLIF(mask_stored4(last4), ''), '••••') END $$;

CREATE FUNCTION mask_phone(txt text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN COALESCE(txt, '') = '' THEN ''
    ELSE '••• ••• ' || right(regexp_replace(txt, '\D', '', 'g'), 4) END $$;

CREATE FUNCTION mask_email(txt text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN COALESCE(txt, '') = '' THEN ''
    WHEN position('@' IN txt) > 1 THEN left(txt, 1) || '***@' || split_part(txt, '@', 2)
    ELSE '***' END $$;

-- audit_mask (first made in 0024) now builds its shapes with the mask_* functions above.
CREATE OR REPLACE FUNCTION audit_mask(table_name text, row_json jsonb) RETURNS jsonb
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
  stored4_cols constant text[] := ARRAY['bank_account_last4', 'ewallet_payment_id_last4', 'id_number_last4'];
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
      WHEN col.key = ANY(last4_cols) THEN to_jsonb(mask_last4(txt))
      WHEN col.key = ANY(stored4_cols) THEN to_jsonb(mask_stored4(txt))
      WHEN col.key = ANY(phone_cols) THEN to_jsonb(mask_phone(txt))
      WHEN col.key = ANY(email_cols) THEN to_jsonb(mask_email(txt))
      ELSE col.value END);
  END LOOP;

  RETURN masked;
END $$;
