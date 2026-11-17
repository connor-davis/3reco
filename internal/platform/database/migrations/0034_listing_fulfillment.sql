-- Existing stock keeps unspecified terms until its seller edits it.
ALTER TABLE stock
    ADD COLUMN fulfillment_mode text CHECK (fulfillment_mode IN ('pickup', 'delivery', 'both')),
    ADD COLUMN pickup_area text CHECK (char_length(pickup_area) <= 120);
