-- Request events share unread tracking with chat, but are never presented as typed text.
ALTER TABLE transaction_request_messages
    ADD COLUMN system boolean NOT NULL DEFAULT false;
