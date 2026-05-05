-- Migration 016: Optional loss note on tenders.
--
-- When a Submitted tender is moved to Lost from a row action, the user
-- can attach a free-text reason. The note surfaces in the system note
-- timeline and helps Win/Loss analysis later. No constraint, no enum -
-- pure free-text. Drop / Won are unaffected.
--
-- Apply on Railway via the Postgres Query tab, one statement at a time:

ALTER TABLE tenders ADD COLUMN IF NOT EXISTS loss_note TEXT NULL;
