const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/no-mans-land
//   ?search=...    - case-insensitive substring on company / contact /
//                    tender_title
//   ?reason=...    - one of the DropReason enum values
//   ?source=tender|prospect
//
// Returns a unified list of dropped tenders + dropped prospects with a
// `source` discriminator. dropped_at IS NOT NULL on every row by
// definition. Sort: most recently dropped first.
router.get('/', async (req, res) => {
  const { search, reason, source } = req.query;
  try {
    const params = [];
    const filterSource = source === 'tender' || source === 'prospect' ? source : null;

    let query = `
      SELECT
        'tender' AS source,
        t.id,
        c.company_name AS company,
        NULL AS contact,
        t.title AS tender_title,
        t.status AS stage_when_dropped,
        t.drop_reason,
        t.drop_note,
        t.dropped_at,
        t.updated_at AS last_contact
      FROM tenders t
      LEFT JOIN clients c ON t.client_id = c.id
      WHERE t.dropped_at IS NOT NULL

      UNION ALL

      SELECT
        'prospect' AS source,
        sp.id,
        sp.company_name AS company,
        sp.contact_name AS contact,
        sp.tender_title,
        sp.status AS stage_when_dropped,
        sp.drop_reason,
        sp.drop_note,
        sp.dropped_at,
        sp.last_contact_date::timestamp AS last_contact
      FROM sales_pipeline sp
      WHERE sp.dropped_at IS NOT NULL
    `;

    // Server-side filters apply post-union via a wrapper select.
    const whereParts = [];
    if (filterSource) {
      params.push(filterSource);
      whereParts.push(`source = $${params.length}`);
    }
    if (reason) {
      params.push(reason);
      whereParts.push(`drop_reason = $${params.length}`);
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim().toLowerCase()}%`);
      whereParts.push(
        `(LOWER(COALESCE(company, '')) LIKE $${params.length} OR ` +
        `LOWER(COALESCE(contact, '')) LIKE $${params.length} OR ` +
        `LOWER(COALESCE(tender_title, '')) LIKE $${params.length})`
      );
    }

    const whereClause = whereParts.length
      ? ` WHERE ${whereParts.join(' AND ')}`
      : '';

    const finalQuery = `
      SELECT * FROM (
        ${query}
      ) nml
      ${whereClause}
      ORDER BY dropped_at DESC NULLS LAST
    `;

    const result = await pool.query(finalQuery, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('No Man\'s Land list error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
