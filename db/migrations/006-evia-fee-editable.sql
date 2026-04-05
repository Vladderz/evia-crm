-- Convert evia_fee from a GENERATED ALWAYS column to a regular column
-- so it can be manually overridden per tender.

ALTER TABLE tenders DROP COLUMN evia_fee;
ALTER TABLE tenders ADD COLUMN evia_fee NUMERIC;

-- Backfill existing rows using the same formula as before
UPDATE tenders
SET evia_fee = GREATEST(estimated_value * 0.03, 2000)
WHERE estimated_value IS NOT NULL AND estimated_value > 0;
