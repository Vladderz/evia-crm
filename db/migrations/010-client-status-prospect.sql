-- Align clients.status CHECK constraint with the values the app actually uses.
-- The app uses 'active_client', 'seeking_tender', 'prospect'.
-- The original constraint still allowed 'nurturing' and 'cold' and rejected 'prospect',
-- causing inserts from the Client Book "Add Client" form to fail.

BEGIN;

-- Migrate any legacy rows still on the old values
UPDATE clients SET status = 'prospect' WHERE status IN ('nurturing', 'cold');

-- Replace the CHECK constraint
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IN ('active_client', 'seeking_tender', 'prospect'));

-- Update the column default to match
ALTER TABLE clients ALTER COLUMN status SET DEFAULT 'prospect';

COMMIT;
