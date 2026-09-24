// Procurement type rules shared between the tender / pipeline /
// prospected routes. Kept plain CommonJS to match the surrounding
// route files. See migration 020-add-tender-procurement-type.sql.

const PROCUREMENT_TYPES = ['tender', 'framework', 'dps'];

const PROCUREMENT_TYPE_LABELS = {
  tender:    'Tender',
  framework: 'Framework',
  dps:       'DPS',
};

// Returns the value if allowed. Returns null to signal invalid so
// callers can respond with a 400 / their own error shape. Null / empty
// string / undefined are considered invalid here; callers that want
// "missing = default" apply their own coalesce before calling.
function validateProcurementType(value) {
  if (typeof value !== 'string') return null;
  return PROCUREMENT_TYPES.includes(value) ? value : null;
}

module.exports = {
  PROCUREMENT_TYPES,
  PROCUREMENT_TYPE_LABELS,
  validateProcurementType,
};
