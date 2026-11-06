-- Trade records are kept by law. Nobody may delete a transaction, its items or
-- its receipts; the privacy erase and retention jobs remove personal details
-- with UPDATE instead. UPDATE stays allowed.
CREATE FUNCTION keep_transactions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Transactions are never deleted: % on % is blocked. Remove personal details with an UPDATE instead.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER keep_transactions_row BEFORE DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION keep_transactions();
CREATE TRIGGER keep_transactions_truncate BEFORE TRUNCATE ON transactions
  FOR EACH STATEMENT EXECUTE FUNCTION keep_transactions();

CREATE TRIGGER keep_transaction_items_row BEFORE DELETE ON transaction_items
  FOR EACH ROW EXECUTE FUNCTION keep_transactions();
CREATE TRIGGER keep_transaction_items_truncate BEFORE TRUNCATE ON transaction_items
  FOR EACH STATEMENT EXECUTE FUNCTION keep_transactions();

CREATE TRIGGER keep_transaction_receipts_row BEFORE DELETE ON transaction_receipts
  FOR EACH ROW EXECUTE FUNCTION keep_transactions();
CREATE TRIGGER keep_transaction_receipts_truncate BEFORE TRUNCATE ON transaction_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION keep_transactions();
