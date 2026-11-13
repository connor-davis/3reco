-- A business survives removal of the person who originally opened it.
CREATE TABLE businesses (
  id text PRIMARY KEY REFERENCES users(id),
  business_name text,
  business_registration_number text,
  bank_account_holder_name text,
  bank_name text,
  bank_account_number text,
  bank_branch_code text,
  bank_account_type text,
  street_address text,
  city text,
  area_code integer,
  province text,
  avatar_key text,
  image text,
  business_verified_at timestamptz,
  business_verified_by text REFERENCES users(id) ON DELETE SET NULL,
  is_removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (bank_account_type IN ('Cheque', 'Savings', 'Transmission')),
  CHECK (province IN ('Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'))
);

CREATE TABLE business_members (
  business_id text NOT NULL REFERENCES businesses(id),
  user_id text NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'member')),
  PRIMARY KEY (business_id, user_id)
);
CREATE INDEX business_members_user_idx ON business_members(user_id);

-- Business reads keep the old contact projection while all business fields
-- come from the business. A removed founder cannot hide the team's store.
CREATE VIEW business_profiles AS
SELECT b.*,
  COALESCE(CASE WHEN founder.user_id IS NOT NULL THEN u.name END,b.business_name,'Unknown') AS name,
  CASE WHEN founder.user_id IS NOT NULL THEN u.first_name END AS first_name,
  CASE WHEN founder.user_id IS NOT NULL THEN u.last_name END AS last_name,
  CASE WHEN founder.role IN ('owner','manager') THEN u.email END AS email,
  CASE WHEN founder.user_id IS NOT NULL THEN u.phone END AS phone,
  'business'::text AS role
FROM businesses b JOIN users u ON u.id=b.id
LEFT JOIN business_members founder ON founder.business_id=b.id AND founder.user_id=u.id
  AND NOT u.is_removed
UNION ALL
-- Retained trades can name an account removed before businesses existed.
-- These fallback contacts keep that history readable without creating tenants.
SELECT u.id,NULL,NULL,u.bank_account_holder_name,u.bank_name,u.bank_account_number,
  u.bank_branch_code,u.bank_account_type,u.street_address,u.city,u.area_code,u.province,
  u.avatar_key,u.image,NULL::timestamptz,NULL::text,u.is_removed,u.created_at,u.updated_at,
  u.name,u.first_name,u.last_name,u.email,u.phone,u.role
FROM users u WHERE NOT EXISTS(SELECT 1 FROM businesses b WHERE b.id=u.id);

INSERT INTO businesses (id, business_name, business_registration_number, bank_account_holder_name, bank_name, bank_account_number, bank_branch_code, bank_account_type, street_address, city, area_code, province, avatar_key, image, business_verified_at, business_verified_by, created_at, updated_at)
SELECT id, business_name, business_registration_number, bank_account_holder_name, bank_name, bank_account_number, bank_branch_code, bank_account_type, street_address, city, area_code, province, avatar_key, image, business_verified_at, business_verified_by, created_at, updated_at
FROM users WHERE role = 'business';
INSERT INTO business_members SELECT id, id, 'owner' FROM businesses;

ALTER TABLE notifications ADD COLUMN business_id text REFERENCES businesses(id);

ALTER TABLE sessions ADD COLUMN active_business_id text REFERENCES businesses(id);
UPDATE sessions s SET active_business_id = b.id FROM businesses b WHERE b.id = s.user_id;
ALTER TABLE audit_log ADD COLUMN business_id text;
CREATE INDEX audit_log_business_idx ON audit_log(business_id);

-- Copied columns keep their names, so audit_mask already masks every sensitive field.
CREATE OR REPLACE FUNCTION audit_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor text := NULLIF(COALESCE(current_setting('app.actor_id', true), ''), '');
  business text := NULLIF(COALESCE(current_setting('app.business_id', true), ''), '');
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

  INSERT INTO audit_log (actor_id, business_id, table_name, row_key, action, old_values, new_values)
  VALUES (actor, business, TG_TABLE_NAME, key_json, lower(TG_OP), old_out, new_out);

  RETURN NULL;
END $$;

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON businesses
  FOR EACH ROW EXECUTE FUNCTION audit_row('id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON business_members
  FOR EACH ROW EXECUTE FUNCTION audit_row('business_id', 'user_id');

-- Bank and address columns remain for people. Existing business values now
-- belong only to the business; a later personal role must not inherit them.
UPDATE users SET bank_account_holder_name=NULL, bank_name=NULL, bank_account_number=NULL,
  bank_branch_code=NULL, bank_account_type=NULL, street_address=NULL, city=NULL,
  area_code=NULL, province=NULL WHERE role='business';
UPDATE businesses b SET is_removed=u.is_removed FROM users u WHERE u.id=b.id;

DROP TRIGGER realtime ON users;
DROP TRIGGER business_verified_notify ON users;
ALTER TABLE users
  DROP COLUMN business_name,
  DROP COLUMN business_registration_number,
  DROP COLUMN business_verified_at,
  DROP COLUMN business_verified_by;
CREATE OR REPLACE FUNCTION business_user_ids(bid text) RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(m.user_id), '{}') FROM business_members m
  JOIN users u ON u.id=m.user_id WHERE m.business_id=bid AND NOT u.is_removed
$$;
CREATE OR REPLACE FUNCTION notify_change() RETURNS trigger AS $$
DECLARE
  rec        record;
  buyer      text;
  listeners  text[];
  was_listed boolean := false;
  op         text := lower(TG_OP);
BEGIN
  IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;

  CASE TG_TABLE_NAME
    WHEN 'notifications' THEN
      IF rec.business_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM business_members m
        WHERE m.business_id=rec.business_id AND m.user_id=rec.user_id
      ) THEN
        RETURN NULL;
      END IF;

      PERFORM realtime_send('notification', rec.id, op, ARRAY[rec.user_id]);

    WHEN 'stock' THEN
      PERFORM realtime_send('stock', rec.id, op, ARRAY[rec.owner_id]);

      IF TG_OP <> 'INSERT' THEN was_listed := OLD.is_listed; END IF;

      -- The public market only changes when a listed row appears, changes or goes.
      IF was_listed OR (TG_OP <> 'DELETE' AND NEW.is_listed) THEN
        PERFORM realtime_send('listing', rec.id, op, '{}', 'all');
      END IF;

    WHEN 'carts' THEN
      PERFORM realtime_send('cart', rec.id, op, ARRAY[rec.buyer_id]);

    WHEN 'cart_items' THEN
      SELECT buyer_id INTO buyer FROM carts WHERE id = rec.cart_id;

      -- The cart is already gone when its items go with it; the carts trigger spoke.
      IF buyer IS NULL THEN RETURN NULL; END IF;

      PERFORM realtime_send('cart', rec.cart_id, op, ARRAY[buyer]);

    WHEN 'transaction_requests' THEN
      listeners := ARRAY[rec.seller_id, rec.buyer_id];

      IF TG_OP = 'UPDATE' THEN
        listeners := listeners || ARRAY[OLD.seller_id, OLD.buyer_id];

        -- A chat message only moves activity_at (0011). Staff cannot read
        -- chats, so that kind of change goes to the two people and admins.
        IF to_jsonb(OLD) - 'activity_at' = to_jsonb(NEW) - 'activity_at' THEN
          PERFORM realtime_send('request', rec.id, op, listeners, 'admin');
          RETURN NULL;
        END IF;
      END IF;

      PERFORM realtime_send('request', rec.id, op, listeners, 'staff');

    WHEN 'transactions' THEN
      listeners := transaction_listeners(rec.type, rec.buyer_id, rec.seller_id);

      PERFORM realtime_send('transaction', rec.id, op, listeners, 'staff');

    WHEN 'transaction_receipts' THEN
      SELECT transaction_listeners(t.type, t.buyer_id, t.seller_id) INTO listeners
        FROM transactions t WHERE t.id = rec.transaction_id;

      -- The transaction is already gone when its receipts go with it.
      IF listeners IS NULL THEN RETURN NULL; END IF;

      PERFORM realtime_send('transaction', rec.transaction_id, op, listeners, 'staff');

    WHEN 'users' THEN
      -- Admin fields and store logos are live; passwords and terms stay quiet.
      IF TG_OP = 'UPDATE' THEN
        IF (
          OLD.role, OLD.is_removed, OLD.name, OLD.first_name, OLD.last_name,
          OLD.email, OLD.profile_complete, OLD.avatar_key
        ) IS NOT DISTINCT FROM (
          NEW.role, NEW.is_removed, NEW.name, NEW.first_name, NEW.last_name,
          NEW.email, NEW.profile_complete, NEW.avatar_key
        ) THEN
          RETURN NULL;
        END IF;
      END IF;

      PERFORM realtime_send('user', rec.id, op, ARRAY[rec.id], 'admin');

    WHEN 'businesses' THEN
      IF TG_OP = 'UPDATE' AND
        (OLD.business_name,OLD.avatar_key,OLD.business_verified_at,OLD.is_removed)
        IS NOT DISTINCT FROM
        (NEW.business_name,NEW.avatar_key,NEW.business_verified_at,NEW.is_removed) THEN
        RETURN NULL;
      END IF;

      PERFORM realtime_send('user', rec.id, op, business_user_ids(rec.id), 'admin');
      IF TG_OP = 'UPDATE' AND OLD.avatar_key IS DISTINCT FROM NEW.avatar_key THEN
        PERFORM realtime_send('listing', rec.id, op, '{}', 'all');
      END IF;

    WHEN 'materials' THEN
      PERFORM realtime_send('material', rec.id, op, '{}', 'all');

    WHEN 'collectors' THEN
      listeners := ARRAY[rec.created_by_business_id] || collector_users(rec.normalized_phone);

      IF TG_OP = 'UPDATE' THEN
        listeners := listeners || ARRAY[OLD.created_by_business_id]
          || collector_users(OLD.normalized_phone);
      END IF;

      PERFORM realtime_send('collector', rec.id, op, listeners, 'staff');

    WHEN 'store_reviews' THEN
      PERFORM realtime_send('review', rec.id, op, '{}', 'all');
  END CASE;

  RETURN NULL;
END
$$ LANGUAGE plpgsql;


CREATE TRIGGER realtime AFTER INSERT OR DELETE OR UPDATE OF
  role, is_removed, name, first_name, last_name, email, profile_complete, avatar_key
  ON users FOR EACH ROW EXECUTE FUNCTION notify_change();
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON businesses
  FOR EACH ROW EXECUTE FUNCTION notify_change();

CREATE OR REPLACE FUNCTION notify_business_verified() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.business_verified_at IS DISTINCT FROM NEW.business_verified_at THEN
    PERFORM realtime_send('listing', NEW.id, 'update', '{}', 'all');
    PERFORM realtime_send('transaction', NEW.id, 'update', '{}', 'all');
  END IF;

  RETURN NULL;
END $$;
CREATE TRIGGER business_verified_notify AFTER UPDATE OF business_verified_at ON businesses
  FOR EACH ROW EXECUTE FUNCTION notify_business_verified();

-- Personal inbox and account events stay personal. Trade recipients are businesses.
CREATE OR REPLACE FUNCTION realtime_send(
  kind text, row_id text, op text, users text[], aud text DEFAULT ''
) RETURNS void LANGUAGE sql AS $$
  SELECT pg_notify('threereco_changes', json_build_object(
    'kind', kind, 'id', row_id, 'op', lower(op), 'aud', aud,
    'businesses', CASE WHEN kind IN ('notification','user','membership') THEN '{}'::text[]
      ELSE ARRAY(SELECT id FROM businesses WHERE id=ANY(users)) END,
    'users', CASE WHEN kind IN ('notification','user','membership') THEN users
      ELSE ARRAY(SELECT DISTINCT id FROM (
        SELECT unnest(business_user_ids(b.id)) AS id FROM businesses b WHERE b.id=ANY(users)
        UNION SELECT direct.id FROM unnest(users) AS direct(id) WHERE NOT EXISTS(SELECT 1 FROM businesses b WHERE b.id=direct.id)
      ) recipients WHERE id IS NOT NULL) END
  )::text)
$$;

CREATE FUNCTION notify_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM realtime_send('membership', OLD.user_id, 'update', ARRAY[OLD.user_id]);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM realtime_send('membership', NEW.user_id, 'update', ARRAY[NEW.user_id]);
  END IF;

  RETURN NULL;
END $$;
CREATE TRIGGER realtime AFTER INSERT OR UPDATE OR DELETE ON business_members
  FOR EACH ROW EXECUTE FUNCTION notify_membership();
