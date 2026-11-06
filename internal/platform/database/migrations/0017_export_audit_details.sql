-- Keep the download kind and filters with each export event, including empty exports.
ALTER TABLE privacy_events ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
