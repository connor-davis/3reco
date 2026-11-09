-- Keep imported identity pictures while storing new avatars in MinIO.
ALTER TABLE users ADD COLUMN avatar_key text;
