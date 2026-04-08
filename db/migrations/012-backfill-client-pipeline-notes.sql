-- Backfill a system note for any existing client or pipeline prospect that
-- has none, so the inline latest-note sub-row on the Client Book and Sales
-- Pipeline tables has something to render. Rows added after migration 009
-- already get these notes automatically on insert; this only touches legacy
-- rows that pre-date that change.

BEGIN;

INSERT INTO client_notes (client_id, note, note_type, created_by)
SELECT c.id, 'Client added', 'system', c.created_by
FROM clients c
WHERE NOT EXISTS (
  SELECT 1 FROM client_notes cn WHERE cn.client_id = c.id
);

INSERT INTO pipeline_notes (pipeline_id, note, note_type, created_by)
SELECT sp.id, 'Prospect added to pipeline', 'system', sp.created_by
FROM sales_pipeline sp
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_notes pn WHERE pn.pipeline_id = sp.id
);

COMMIT;
