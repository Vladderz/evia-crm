-- Add 'waiting_room' as a third sales_pipeline stage.
-- Flow: contacted -> call_booked -> waiting_room -> (promoted to Active Tenders).
-- Run each statement individually in Railway's Query tab; the tab cannot
-- handle multi-statement transactions, so this file is intentionally not
-- wrapped in BEGIN/COMMIT and does not use a DO block.

ALTER TABLE sales_pipeline DROP CONSTRAINT sales_pipeline_status_check;

ALTER TABLE sales_pipeline ADD CONSTRAINT sales_pipeline_status_check
  CHECK (status IN ('contacted','call_booked','waiting_room'));
