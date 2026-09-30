-- Migration 022: Bid stage on tenders.
--
-- Some tenders run in two rounds: a Pre-Qualification Questionnaire
-- (PSQ), then a shortlist, then an Invitation to Tender (ITT) for the
-- shortlisted bidders. bid_stage marks which round a row is in without
-- introducing new statuses or new tabs. 'single' is the default, so
-- every existing row keeps behaving as a one-round bid; 'psq' rows
-- flip to 'itt' when the shortlist is confirmed (see
-- POST /api/tenders/:id/shortlist). DPS applications are single round
-- and the client hides the stage control for them.
--
-- The server applies this file automatically on startup
-- (see lib/ensureBidStageColumn.js) and it is safe to run by hand:
-- the IF NOT EXISTS guard means repeat runs are a no-op.

ALTER TABLE tenders ADD COLUMN IF NOT EXISTS bid_stage TEXT NOT NULL DEFAULT 'single' CHECK (bid_stage IN ('single', 'psq', 'itt'));
