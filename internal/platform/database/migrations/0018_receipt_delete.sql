-- A receipt is an attachment, not the trade record, so its people may remove
-- it. The transaction and its items stay undeletable; truncate stays blocked.
DROP TRIGGER keep_transaction_receipts_row ON transaction_receipts;
