-- Migration 015: Drop / No Man's Land state.
--
-- A "Drop" is a terminal-but-recoverable state for tenders and
-- prospects: the engagement is paused but the relationship is alive.
-- Dropped rows live on the No Man's Land page and can be re-engaged
-- back into Active Tenders or Sales Pipeline.
--
-- Distinct from Lost (we submitted and lost) and Won. Distinct from
-- Archived. Drop preserves the prior status on the row, so the
-- "Stage when dropped" column in No Man's Land just reads the
-- existing status field; only dropped_at gets set on drop.
--
-- This migration also collapses the Sales Pipeline status enum from
-- five values down to two (contacted, call_booked). The legacy
-- not_interested rows are migrated to dropped state; legacy
-- contract_summary_sent and agreed rows fold into call_booked.
--
-- Apply on Railway:
--   psql $DATABASE_URL -f db/migrations/015-add-drop-state.sql

BEGIN;

-- ----- tenders -------------------------------------------------------

ALTER TABLE tenders ADD COLUMN IF NOT EXISTS dropped_at  TIMESTAMP NULL;
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS drop_reason VARCHAR(32) NULL;
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS drop_note   TEXT NULL;

ALTER TABLE tenders DROP CONSTRAINT IF EXISTS tenders_drop_reason_check;
ALTER TABLE tenders
  ADD CONSTRAINT tenders_drop_reason_check
  CHECK (drop_reason IS NULL OR drop_reason IN (
    'not_interested', 'went_with_other', 'price_concern',
    'ghosted', 'timing', 'other'
  ));

CREATE INDEX IF NOT EXISTS tenders_dropped_at_idx
  ON tenders (dropped_at)
  WHERE dropped_at IS NOT NULL;

-- ----- sales_pipeline ------------------------------------------------

ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS dropped_at  TIMESTAMP NULL;
ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS drop_reason VARCHAR(32) NULL;
ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS drop_note   TEXT NULL;

ALTER TABLE sales_pipeline DROP CONSTRAINT IF EXISTS sales_pipeline_drop_reason_check;
ALTER TABLE sales_pipeline
  ADD CONSTRAINT sales_pipeline_drop_reason_check
  CHECK (drop_reason IS NULL OR drop_reason IN (
    'not_interested', 'went_with_other', 'price_concern',
    'ghosted', 'timing', 'other'
  ));

CREATE INDEX IF NOT EXISTS sales_pipeline_dropped_at_idx
  ON sales_pipeline (dropped_at)
  WHERE dropped_at IS NOT NULL;

-- ----- backfill: legacy not_interested -> dropped --------------------

-- Existing legacy "drop" rows used status = 'not_interested'. Migrate
-- them into the new dropped-state model with reason = 'not_interested'
-- and revert status to 'call_booked' so the row remains valid under
-- the tightened status constraint below. The original prior stage is
-- not preserved (we did not record it) - call_booked is the most
-- likely default. New drops via POST /pipeline/:id/drop preserve the
-- actual prior stage.
UPDATE sales_pipeline
SET
  dropped_at  = COALESCE(dropped_at, updated_at, NOW()),
  drop_reason = COALESCE(drop_reason, 'not_interested'),
  status      = 'call_booked'
WHERE status = 'not_interested';

-- ----- backfill: legacy stages -> call_booked ------------------------

-- Sales Pipeline collapses from 5 stages to 2 (contacted, call_booked).
-- contract_summary_sent and agreed rows that were not promoted to
-- Active Tenders fall back to call_booked.
UPDATE sales_pipeline
SET
  status     = 'call_booked',
  updated_at = NOW()
WHERE status IN ('contract_summary_sent', 'agreed');

-- ----- tighten the sales_pipeline status enum ------------------------

ALTER TABLE sales_pipeline DROP CONSTRAINT IF EXISTS sales_pipeline_status_check;
ALTER TABLE sales_pipeline
  ADD CONSTRAINT sales_pipeline_status_check
  CHECK (status IN ('contacted', 'call_booked'));

COMMIT;
