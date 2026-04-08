-- Simplify sales_pipeline statuses.
-- Remove call_done and contract_sent. Both collapse into the new contract_summary_sent.
-- New active flow: contacted -> call_booked -> contract_summary_sent -> agreed.

BEGIN;

UPDATE sales_pipeline
SET status = 'contract_summary_sent'
WHERE status IN ('call_done', 'contract_sent');

ALTER TABLE sales_pipeline DROP CONSTRAINT IF EXISTS sales_pipeline_status_check;
ALTER TABLE sales_pipeline
  ADD CONSTRAINT sales_pipeline_status_check
  CHECK (status IN ('contacted', 'call_booked', 'contract_summary_sent', 'agreed', 'not_interested'));

COMMIT;
