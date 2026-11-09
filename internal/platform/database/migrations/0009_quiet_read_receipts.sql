-- A read receipt is only ever shown to the reader, whose client already
-- refreshes its own unread counts. Notifying request:<id> made every open
-- thread reload right after it loaded, so the table no longer speaks.
DROP TRIGGER IF EXISTS realtime ON request_message_reads;
