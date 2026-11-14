-- An admin may delete a confirmed duplicate collection for good. That one path
-- sets threereco.allow_duplicate_delete for its own transaction; every other
-- DELETE and every TRUNCATE on trade records stays blocked, as migration 0010
-- made it. The audit triggers still write a line for each deleted row.
CREATE OR REPLACE FUNCTION keep_transactions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND COALESCE(current_setting('threereco.allow_duplicate_delete', true), '') = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Transactions are never deleted: % on % is blocked. Remove personal details with an UPDATE instead.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
