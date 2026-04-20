-- Add a notice_id column to prospected_contracts so duplicate detection can
-- match on the stable FTS notice identifier (the path segment after /Notice/)
-- rather than the full URL string. Two users pasting the same notice from
-- different places produce different URLs but share a notice_id.
--
-- The OCDS release.id stored in ocds_id is a separate identifier and is left
-- untouched.
--
-- Before running: execute audit-duplicate-notice-ids.sql and resolve any
-- duplicates manually. The partial unique index below will fail if duplicates
-- remain.

BEGIN;

ALTER TABLE prospected_contracts
  ADD COLUMN IF NOT EXISTS notice_id VARCHAR(100);

-- Backfill notice_id from existing url values. Case-insensitive match on the
-- path segment following /Notice/, stopping at the next / ? or #. Rows whose
-- url does not contain /Notice/... are left NULL.
UPDATE prospected_contracts
SET notice_id = (regexp_match(url, '/Notice/([^/?#]+)', 'i'))[1]
WHERE notice_id IS NULL
  AND url ~* '/Notice/[^/?#]+';

-- Partial unique index: enforces global uniqueness on notice_id while
-- allowing any number of rows with notice_id IS NULL (manual entries without
-- a parseable FTS URL).
CREATE UNIQUE INDEX IF NOT EXISTS prospected_contracts_notice_id_unique
  ON prospected_contracts (notice_id)
  WHERE notice_id IS NOT NULL;

COMMIT;
