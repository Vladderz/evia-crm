-- Add an optional FK from sales_pipeline to clients so a prospect can
-- be raised against a company that already has a Client Book profile.
-- Nullable, no backfill: existing rows keep client_id NULL and continue
-- to behave exactly as they do today (the promote path falls back to
-- the case-insensitive name lookup when client_id is null).
-- Run each statement individually in Railway's Query tab.

ALTER TABLE sales_pipeline
  ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_pipeline_client_id
  ON sales_pipeline(client_id);
