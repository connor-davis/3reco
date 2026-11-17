-- Successful queries are kept; unsuccessful queries may be retried after a day.
CREATE TABLE geocode_cache (
    query text PRIMARY KEY,
    latitude numeric NULL,
    longitude numeric NULL,
    found boolean NOT NULL,
    looked_up_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((found AND latitude IS NOT NULL AND longitude IS NOT NULL)
        OR (NOT found AND latitude IS NULL AND longitude IS NULL))
);
