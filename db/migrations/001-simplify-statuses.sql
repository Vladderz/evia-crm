-- Migrate existing tender statuses to the new workflow
BEGIN;
UPDATE tenders SET status = 'questionnaire_sent' WHERE status = 'researching';
UPDATE tenders SET status = 'writing' WHERE status = 'qa';
UPDATE tenders SET status = 'submitted' WHERE status = 'awaiting_result';
COMMIT;
