-- Map point of a business's saved address, for the market distance filter.
-- Empty when the address is blank or could not be placed. Never sent to the web.
ALTER TABLE businesses
    ADD COLUMN latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    ADD COLUMN longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT businesses_point_pair CHECK ((latitude IS NULL) = (longitude IS NULL));
