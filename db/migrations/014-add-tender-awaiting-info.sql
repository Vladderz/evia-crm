-- Migration 014: Add "Awaiting client input" flag to tenders.
--
-- Surfaces in the Active Tenders UI as a second amber badge on
-- a row, stacked under the Writing badge. Only meaningful when
-- status = 'writing'. Toggle + optional note live in the
-- Add/Edit Tender drawer.
--
-- Apply on Railway:
--   psql $DATABASE_URL -f db/migrations/014-add-tender-awaiting-info.sql

ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS awaiting_info BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS awaiting_info_note TEXT;
