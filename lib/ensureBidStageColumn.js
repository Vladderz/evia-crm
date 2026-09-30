// Startup step for the bid_stage column on tenders. Runs before the
// server starts listening (see server.js) alongside ensureIncomeSchema
// but wired independently so a failure in one can never block the
// other. The wrapped SQL in db/migrations/022-add-tender-bid-stage.sql
// uses IF NOT EXISTS, so applying it on every boot is a cheap no-op
// once the column is present.

const fs = require('fs');
const path = require('path');

const MIGRATION_PATH = path.join(
  __dirname,
  '..',
  'db',
  'migrations',
  '022-add-tender-bid-stage.sql',
);

async function ensureBidStageColumn(pool) {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  await pool.query(sql);
  console.log('[bid_stage] Ensured tenders.bid_stage column present.');
}

module.exports = { ensureBidStageColumn };
