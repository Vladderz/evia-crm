const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

async function logActivity(userId, action, entityType, entityId, details) {
  try {
    await pool.query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, entityType, entityId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

// GET /api/prospected/stats - registered before /:id
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      WITH user_ids AS (
        SELECT
          MAX(id) FILTER (WHERE email = 'vlad@eviamarketing.co.uk') AS vlad_id,
          MAX(id) FILTER (WHERE email = 'tristan@eviamarketing.co.uk') AS tristan_id
        FROM users
      )
      SELECT
        COUNT(*) FILTER (WHERE pc.created_at::date = CURRENT_DATE) AS today,
        COUNT(*) FILTER (WHERE pc.created_at >= date_trunc('week', CURRENT_DATE)) AS this_week,
        COUNT(*) FILTER (WHERE pc.created_at::date = CURRENT_DATE AND pc.added_by = u.vlad_id) AS vlad_today,
        COUNT(*) FILTER (WHERE pc.created_at >= date_trunc('week', CURRENT_DATE) AND pc.added_by = u.vlad_id) AS vlad_week,
        COUNT(*) FILTER (WHERE pc.created_at::date = CURRENT_DATE AND pc.added_by = u.tristan_id) AS tristan_today,
        COUNT(*) FILTER (WHERE pc.created_at >= date_trunc('week', CURRENT_DATE) AND pc.added_by = u.tristan_id) AS tristan_week
      FROM prospected_contracts pc
      CROSS JOIN user_ids u
    `);
    const row = result.rows[0];
    return res.json({
      today:         parseInt(row.today, 10)         || 0,
      this_week:     parseInt(row.this_week, 10)     || 0,
      vlad_today:    parseInt(row.vlad_today, 10)    || 0,
      vlad_week:     parseInt(row.vlad_week, 10)     || 0,
      tristan_today: parseInt(row.tristan_today, 10) || 0,
      tristan_week:  parseInt(row.tristan_week, 10)  || 0,
    });
  } catch (err) {
    console.error('Prospected stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/prospected/extract - registered before /:id
router.post('/extract', async (req, res) => {
  const { url } = req.body;
  try {
    const match = url && url.match(/\/Notice\/([^\/\?#]+)/i);
    if (!match) {
      return res.json({ success: false, message: 'Could not extract details from this URL. Please enter the details manually.' });
    }
    const noticeId = match[1];
    const apiUrl = `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages/${noticeId}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return res.json({ success: false, message: 'Could not extract details from this URL. Please enter the details manually.' });
    }
    const data = await response.json();
    const release = data.releases && data.releases[0];
    if (!release || !release.tender) {
      console.warn('[prospected/extract] No release/tender for notice', { noticeId });
      return res.json({ success: false, message: 'Could not extract details from this URL. Please enter the details manually.' });
    }

    const tender = release.tender;
    const notice_tag = Array.isArray(release.tag) && release.tag.length > 0 ? release.tag[0] : null;
    const title = tender.title || null;

    if (!title) {
      console.warn('[prospected/extract] No title for notice', { noticeId, notice_tag });
      return res.json({ success: false, message: 'Could not extract details from this URL. Please enter the details manually.' });
    }

    // Deadline fallback chain. UK4 Contract Notices ("tender" tag) carry a
    // real tenderPeriod.endDate. UK1 Pipeline notices don't - the closest
    // proxy is the date the buyer expects to publish the actual tender
    // notice (communication.futureNoticeDate), and as a last resort the
    // contract start date from lots[0].
    let submission_deadline = null;
    if (tender.tenderPeriod && tender.tenderPeriod.endDate) {
      submission_deadline = tender.tenderPeriod.endDate.slice(0, 10);
    } else if (tender.communication && tender.communication.futureNoticeDate) {
      submission_deadline = tender.communication.futureNoticeDate.slice(0, 10);
    } else if (tender.lots && tender.lots[0] && tender.lots[0].contractPeriod && tender.lots[0].contractPeriod.startDate) {
      submission_deadline = tender.lots[0].contractPeriod.startDate.slice(0, 10);
    }

    if (!submission_deadline) {
      console.warn('[prospected/extract] No deadline derivable for notice', { noticeId, notice_tag });
    }

    const ocds_id = release.id || null;
    let value = null;
    if (tender.value && typeof tender.value.amount === 'number') {
      value = tender.value.amount;
    } else if (tender.minValue && typeof tender.minValue.amount === 'number') {
      value = tender.minValue.amount;
    }
    const buyer =
      (release.buyer && release.buyer.name) ||
      (tender.procuringEntity && tender.procuringEntity.name) ||
      null;
    const sector =
      (tender.items &&
        tender.items[0] &&
        tender.items[0].classification &&
        tender.items[0].classification.description) ||
      null;
    const award_date =
      (tender.awardPeriod && tender.awardPeriod.endDate)
        ? tender.awardPeriod.endDate.slice(0, 10)
        : null;
    return res.json({
      success: true,
      data: { title, submission_deadline, ocds_id, source: 'fts', notice_tag, value, buyer, sector, award_date },
    });
  } catch (err) {
    console.error('Extract error:', err);
    return res.json({ success: false, message: 'Could not extract details from this URL. Please enter the details manually.' });
  }
});

// GET /api/prospected
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query;
    let params = [];

    if (search) {
      query = `
        SELECT pc.*, u.name AS added_by_name
        FROM prospected_contracts pc
        JOIN users u ON pc.added_by = u.id
        WHERE pc.title ILIKE $1
        ORDER BY pc.created_at DESC
      `;
      params = [`%${search}%`];
    } else {
      query = `
        SELECT pc.*, u.name AS added_by_name
        FROM prospected_contracts pc
        JOIN users u ON pc.added_by = u.id
        ORDER BY pc.created_at DESC
      `;
    }

    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('List prospected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/prospected
router.post('/', async (req, res) => {
  const { title, url, submission_deadline, source, ocds_id } = req.body;

  if (!title || !url || !submission_deadline) {
    return res.status(400).json({ error: 'title, url, and submission_deadline are required' });
  }

  try {
    // Parse the FTS notice id from the URL path. This is the stable dedup
    // key — the same notice can be pasted with different query strings and
    // still resolve to the same notice_id.
    const noticeMatch = url.match(/\/Notice\/([^/?#]+)/i);
    const noticeId = noticeMatch ? noticeMatch[1] : null;

    // Primary check: notice_id if we could parse one. Fallback: exact URL
    // match, which catches legacy rows and any edge cases where parsing
    // fails (non-FTS URLs, manual entries).
    const existing = noticeId
      ? await pool.query(
          `SELECT pc.id, pc.created_at, u.name AS added_by_name
           FROM prospected_contracts pc
           JOIN users u ON pc.added_by = u.id
           WHERE pc.notice_id = $1`,
          [noticeId]
        )
      : await pool.query(
          `SELECT pc.id, pc.created_at, u.name AS added_by_name
           FROM prospected_contracts pc
           JOIN users u ON pc.added_by = u.id
           WHERE pc.url = $1`,
          [url]
        );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return res.status(409).json({
        error: `This contract has already been added by ${row.added_by_name}`,
        existing: {
          id: row.id,
          added_by_name: row.added_by_name,
          created_at: row.created_at,
          stage: 'Contracts Prospected',
        },
      });
    }

    const result = await pool.query(
      `INSERT INTO prospected_contracts (title, url, submission_deadline, source, ocds_id, notice_id, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, url, submission_deadline, source || 'manual', ocds_id || null, noticeId, req.session.userId]
    );
    const contract = result.rows[0];

    await logActivity(req.session.userId, 'prospected_contract_added', 'prospected_contract', contract.id, {
      title: contract.title,
      url: contract.url,
      source: contract.source,
    });

    return res.status(201).json(contract);
  } catch (err) {
    console.error('Create prospected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/prospected/:id/promote
router.post('/:id/promote', async (req, res) => {
  try {
    const contractResult = await pool.query('SELECT * FROM prospected_contracts WHERE id = $1', [req.params.id]);
    if (!contractResult.rows[0]) {
      return res.status(404).json({ error: 'Prospected contract not found' });
    }
    const contract = contractResult.rows[0];

    // Look up user name for assigned_to
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.session.userId]);
    const assignedTo = userResult.rows[0] ? userResult.rows[0].name : null;

    const tenderResult = await pool.query(
      `INSERT INTO tenders (title, tender_url, submission_deadline, status, assigned_to, created_by)
       VALUES ($1, $2, $3, 'questionnaire_sent', $4, $5)
       RETURNING *`,
      [contract.title, contract.url, contract.submission_deadline, assignedTo, req.session.userId]
    );
    const tender = tenderResult.rows[0];

    await pool.query('DELETE FROM prospected_contracts WHERE id = $1', [req.params.id]);

    await logActivity(req.session.userId, 'prospected_contract_promoted', 'prospected_contract', contract.id, {
      title: contract.title,
      tender_id: tender.id,
    });

    return res.status(201).json(tender);
  } catch (err) {
    console.error('Promote prospected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/prospected/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM prospected_contracts WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Prospected contract not found' });
    }
    const contract = existing.rows[0];

    await pool.query('DELETE FROM prospected_contracts WHERE id = $1', [req.params.id]);

    await logActivity(req.session.userId, 'prospected_contract_deleted', 'prospected_contract', contract.id, {
      title: contract.title,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete prospected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
