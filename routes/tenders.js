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

async function runAutoArchive(userId) {
  try {
    const result = await pool.query(
      `UPDATE tenders
       SET status = 'archived'
       WHERE status = 'submitted'
         AND submission_deadline < NOW() - INTERVAL '90 days'
       RETURNING id, title`
    );
    for (const row of result.rows) {
      await logActivity(userId, 'auto-archived tender', 'tender', row.id, {
        title: row.title,
        reason: '90 days past deadline with no result recorded',
      });
    }
  } catch (err) {
    console.error('Auto-archive error:', err);
  }
}

// GET /api/tenders/stats - registered before /:id to avoid route conflict
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('questionnaire_sent', 'writing', 'submitted'))::int AS active,
        COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted,
        COALESCE(SUM(estimated_value) FILTER (WHERE status IN ('questionnaire_sent', 'writing', 'submitted')), 0) AS pipeline_value,
        COALESCE(SUM(estimated_value) FILTER (WHERE status = 'won'), 0) AS won_value,
        COALESCE(SUM(evia_fee) FILTER (WHERE status = 'won'), 0) AS won_fees,
        COUNT(*) FILTER (WHERE status = 'won')::int AS won_count,
        COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_count
      FROM tenders
    `);
    const row = result.rows[0];
    return res.json({
      active: row.active,
      submitted: row.submitted,
      pipeline_value: parseFloat(row.pipeline_value),
      won_value: parseFloat(row.won_value) || 0,
      won_fees: parseFloat(row.won_fees),
      won_count: parseInt(row.won_count) || 0,
      lost_count: parseInt(row.lost_count) || 0,
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tenders/check-duplicate - registered before /:id to avoid route conflict
router.get('/check-duplicate', async (req, res) => {
  const { reference, url } = req.query;
  try {
    let result;
    if (reference) {
      result = await pool.query(
        'SELECT id, title FROM tenders WHERE reference_number = $1 LIMIT 1',
        [reference]
      );
    } else if (url) {
      result = await pool.query(
        'SELECT id, title FROM tenders WHERE tender_url = $1 LIMIT 1',
        [url]
      );
    } else {
      return res.json({ exists: false });
    }
    if (result.rows.length > 0) {
      return res.json({ exists: true, title: result.rows[0].title, id: result.rows[0].id });
    }
    return res.json({ exists: false });
  } catch (err) {
    console.error('Check duplicate error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tenders/:id/notes - registered before /:id to avoid route conflict
router.get('/:id/notes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tn.*, u.name as created_by_name
       FROM tender_notes tn
       LEFT JOIN users u ON tn.created_by = u.id
       WHERE tn.tender_id = $1
       ORDER BY tn.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching tender notes:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// POST /api/tenders/:id/notes - registered before /:id to avoid route conflict
router.post('/:id/notes', async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Note cannot be empty' });
    }

    const tender = await pool.query('SELECT id FROM tenders WHERE id = $1', [req.params.id]);
    if (tender.rows.length === 0) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO tender_notes (tender_id, note, note_type, created_by)
       VALUES ($1, $2, 'manual', $3) RETURNING *`,
      [req.params.id, note.trim(), req.session.userId]
    );

    const user = await pool.query('SELECT name FROM users WHERE id = $1', [req.session.userId]);
    const result = { ...rows[0], created_by_name: user.rows[0]?.name || 'Unknown' };

    res.status(201).json(result);
  } catch (err) {
    console.error('Error adding tender note:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// GET /api/tenders
router.get('/', async (req, res) => {
  const { view } = req.query;
  try {
    await runAutoArchive(req.session.userId);

    let query;
    if (view === 'live') {
      query = `
        SELECT t.*, c.company_name AS client_name, u.name AS created_by_name
        FROM tenders t
        LEFT JOIN clients c ON t.client_id = c.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.status IN ('questionnaire_sent', 'writing', 'submitted')
        ORDER BY t.submission_deadline ASC NULLS LAST
      `;
    } else if (view === 'results') {
      query = `
        SELECT t.*, c.company_name AS client_name, u.name AS created_by_name
        FROM tenders t
        LEFT JOIN clients c ON t.client_id = c.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.status IN ('won', 'lost')
        ORDER BY t.updated_at DESC
      `;
    } else {
      query = `
        SELECT t.*, c.company_name AS client_name, u.name AS created_by_name
        FROM tenders t
        LEFT JOIN clients c ON t.client_id = c.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.status NOT IN ('archived', 'prospecting')
        ORDER BY t.submission_deadline ASC NULLS LAST
      `;
    }

    const result = await pool.query(query);
    return res.json(result.rows);
  } catch (err) {
    console.error('List tenders error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tenders/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, c.company_name AS client_name, u.name AS created_by_name
       FROM tenders t
       LEFT JOIN clients c ON t.client_id = c.id
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Tender not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Get tender error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tenders
router.post('/', async (req, res) => {
  const {
    client_id, title, buyer, estimated_value, evia_fee, submission_deadline, award_date,
    portal, reference_number, sector, tender_url, status,
    assigned_to, notes,
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tenders
        (client_id, title, buyer, estimated_value, evia_fee, submission_deadline, award_date, portal,
         reference_number, sector, tender_url, status, assigned_to, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        client_id || null,
        title,
        buyer || null,
        estimated_value || null,
        evia_fee || null,
        submission_deadline || null,
        award_date || null,
        portal || null,
        reference_number || null,
        sector || null,
        tender_url || null,
        status || 'questionnaire_sent',
        assigned_to || null,
        notes || null,
        req.session.userId,
      ]
    );
    const tender = result.rows[0];
    await logActivity(req.session.userId, 'added tender', 'tender', tender.id, {
      title: tender.title,
      buyer: tender.buyer,
      value: tender.estimated_value,
    });
    await pool.query(
      `INSERT INTO tender_notes (tender_id, note, note_type, created_by) VALUES ($1, 'Tender added', 'system', $2)`,
      [tender.id, req.session.userId]
    );
    return res.status(201).json(tender);
  } catch (err) {
    console.error('Create tender error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tenders/:id
router.put('/:id', async (req, res) => {
  try {
    const current = await pool.query('SELECT * FROM tenders WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) {
      return res.status(404).json({ error: 'Tender not found' });
    }
    const prev = current.rows[0];

    // Merge strategy: if a key is present in the request body, use it (converting
    // empty string to null). If a key is absent, preserve the current value.
    // This makes partial updates (e.g. quick status advance) safe.
    const b = req.body;
    const clientId           = 'client_id'           in b ? (b.client_id || null)           : prev.client_id;
    const title              = b.title               || prev.title;
    const buyer              = 'buyer'               in b ? (b.buyer || null)               : prev.buyer;
    const estimatedValue     = 'estimated_value'     in b ? (b.estimated_value || null)     : prev.estimated_value;
    const eviaFee            = 'evia_fee'            in b ? (b.evia_fee || null)            : prev.evia_fee;
    const submissionDeadline = 'submission_deadline' in b ? (b.submission_deadline || null) : prev.submission_deadline;
    const awardDate          = 'award_date'          in b ? (b.award_date || null)          : prev.award_date;
    const portal             = 'portal'              in b ? (b.portal || null)              : prev.portal;
    const referenceNumber    = 'reference_number'    in b ? (b.reference_number || null)    : prev.reference_number;
    const sector             = 'sector'              in b ? (b.sector || null)              : prev.sector;
    const tenderUrl          = 'tender_url'          in b ? (b.tender_url || null)          : prev.tender_url;
    const status             = b.status              || prev.status;
    const assignedTo         = 'assigned_to'         in b ? (b.assigned_to || null)        : prev.assigned_to;
    const notes              = 'notes'               in b ? (b.notes || null)              : prev.notes;

    const result = await pool.query(
      `UPDATE tenders SET
        client_id           = $1,
        title               = $2,
        buyer               = $3,
        estimated_value     = $4,
        evia_fee            = $5,
        submission_deadline = $6,
        award_date          = $7,
        portal              = $8,
        reference_number    = $9,
        sector              = $10,
        tender_url          = $11,
        status              = $12,
        assigned_to         = $13,
        notes               = $14
       WHERE id = $15
       RETURNING *`,
      [clientId, title, buyer, estimatedValue, eviaFee, submissionDeadline, awardDate, portal, referenceNumber, sector, tenderUrl, status, assignedTo, notes, req.params.id]
    );

    const tender = result.rows[0];

    if ((status === 'won' || status === 'lost') && status !== prev.status) {
      await logActivity(req.session.userId, `marked tender as ${status}`, 'tender', tender.id, {
        title: tender.title,
        previous_status: prev.status,
        new_status: status,
        value: tender.estimated_value,
        evia_fee: tender.evia_fee,
      });
    } else {
      const trackFields = ['client_id', 'title', 'buyer', 'estimated_value', 'submission_deadline', 'award_date', 'portal', 'reference_number', 'sector', 'tender_url', 'status', 'assigned_to', 'notes'];
      const fieldsChanged = trackFields.filter(f => String(prev[f]) !== String(tender[f]));
      await logActivity(req.session.userId, 'updated tender', 'tender', tender.id, {
        title: tender.title,
        fields_changed: fieldsChanged,
      });
    }

    if (prev.status !== status) {
      const TENDER_STATUS_LABELS = {
        questionnaire_sent: 'Questionnaire Sent',
        writing: 'Writing',
        submitted: 'Submitted / Awaiting Result',
        won: 'Won',
        lost: 'Lost',
        archived: 'Archived',
      };
      const oldLabel = TENDER_STATUS_LABELS[prev.status] || prev.status;
      const newLabel = TENDER_STATUS_LABELS[status] || status;
      await pool.query(
        `INSERT INTO tender_notes (tender_id, note, note_type, created_by) VALUES ($1, $2, 'system', $3)`,
        [req.params.id, `Status changed from ${oldLabel} to ${newLabel}`, req.session.userId]
      );
    }

    return res.json(tender);
  } catch (err) {
    console.error('Update tender error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tenders/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query('SELECT title FROM tenders WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Tender not found' });
    }
    const { title } = existing.rows[0];
    await pool.query('DELETE FROM tenders WHERE id = $1', [req.params.id]);
    await logActivity(req.session.userId, 'deleted tender', 'tender', parseInt(req.params.id), { title });
    return res.json({ message: 'Tender deleted', title });
  } catch (err) {
    console.error('Delete tender error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
