-- A small copy of each stock photo for market cards. Nullable: photos saved
-- before this migration have none and are served at full size instead.
ALTER TABLE stock_photos ADD COLUMN thumb_key text;

-- audit_mask (last built in 0026) is rebuilt with thumb_key added to the
-- never-logged columns, next to object_key, so the new key stays out of the log.
CREATE OR REPLACE FUNCTION audit_mask(table_name text, row_json jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  -- Never logged: secrets, object keys (files, images) and street addresses.
  -- City and province stay.
  drop_cols  constant text[] := ARRAY[
    'password_hash', 'token_hash', 'avatar_key', 'image_key', 'object_key',
    'thumb_key', 'invoice_key', 'image', 'street_address'];
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
