ALTER TABLE collectors
    ALTER COLUMN phone DROP NOT NULL,
    ALTER COLUMN normalized_phone DROP NOT NULL;

UPDATE collectors SET phone = NULL, normalized_phone = NULL WHERE phone = '';
