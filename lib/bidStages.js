// Bid stage rules shared between the tender routes. Kept plain
// CommonJS in the style of procurementTypes.js. See migration
// 022-add-tender-bid-stage.sql for the DB check constraint and default.

const BID_STAGES = ['single', 'psq', 'itt'];

const BID_STAGE_LABELS = {
  single: 'Single Stage',
  psq:    'PSQ',
  itt:    'ITT',
};

// Returns the value if allowed. Returns null to signal invalid so
// callers can respond with a 400 / their own error shape. Null / empty
// string / undefined are considered invalid here; callers that want
// "missing = default" apply their own coalesce before calling.
function validateBidStage(value) {
  if (typeof value !== 'string') return null;
  return BID_STAGES.includes(value) ? value : null;
}

module.exports = {
  BID_STAGES,
  BID_STAGE_LABELS,
  validateBidStage,
};
