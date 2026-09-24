-- Migration 020: Procurement type on tenders.
--
-- Every tender row is classified as a Tender, Framework or DPS
-- application. Tenders and frameworks are surfaced and counted
-- together; DPS applications are surfaced and counted separately so
-- their pass / fail outcomes never move the tender win rate. Default
-- is 'tender' so existing rows keep behaving as tenders.
--
-- Apply on Railway via the Postgres Query tab, one statement at a time:

ALTER TABLE tenders ADD COLUMN procurement_type TEXT NOT NULL DEFAULT 'tender' CHECK (procurement_type IN ('tender', 'framework', 'dps'));
