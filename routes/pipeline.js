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

const STATUS_LABELS = {
  contacted: 'Contacted',
  call_booked: 'Call Booked',
  call_done: 'Call Done',
  contract_sent: 'Contract Sent',
  agreed: 'Agreed',
  not_interested: 'Not Interested',
};

const ADVANCE_MAP = {
  contacted: 'call_booked',
  call_booked: 'call_done',
  call_done: 'contract_sent',
  contract_sent: 'agreed',
};

// GET /api/pipeline/stats
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('agreed', 'not_interested')) as total,
        COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE status IN ('call_booked', 'call_done')) as in_discussion,
        COUNT(*) FILTER (WHERE status = 'contract_sent') as contract_sent,
        COUNT(*) FILTER (WHERE next_followup_date <= CURRENT_DATE AND status NOT IN ('agreed', 'not_interested')) as overdue_followups
      FROM sales_pipeline
    `);
    const row = result.rows[0];
    return res.json({
      total: parseInt(row.total) || 0,
      contacted: parseInt(row.contacted) || 0,
      in_discussion: parseInt(row.in_discussion) || 0,
      contract_sent: parseInt(row.contract_sent) || 0,
      overdue_followups: parseInt(row.overdue_followups) || 0,
    });
  } catch (err) {
    console.error('Pipeline stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pipeline/from-prospected/:id
router.post('/from-prospected/:id', async (req, res) => {
  try {
    const contractResult = await pool.query(
      'SELECT * FROM prospected_contracts WHERE id = $1',
      [req.params.id]
    );
    if (!contractResult.rows[0]) {
      return res.status(404).json({ error: 'Prospected contract not found' });
    }
    const contract = contractResult.rows[0];

    // Duplicate check by tender_url
    if (contract.url) {
      const existing = await pool.query(
        'SELECT id, company_name FROM sales_pipeline WHERE tender_url = $1',
        [contract.url]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: `This tender is already in the Sales Pipeline for ${existing.rows[0].company_name}`,
        });
      }
    }

    // Look up user name for assigned_to
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.session.userId]);
    const assignedTo = userResult.rows[0] ? userResult.rows[0].name : null;

    const insertResult = await pool.query(
      `INSERT INTO sales_pipeline
        (company_name, tender_title, tender_url, tender_reference, submission_deadline,
         status, last_contact_date, next_followup_date, assigned_to, created_by, prospected_contract_id)
       VALUES ($1, $2, $3, $4, $5, 'contacted', CURRENT_DATE, CURRENT_DATE + INTERVAL '3 days', $6, $7, $8)
       RETURNING *`,
      [
        'TBC',
        contract.title,
        contract.url || null,
        contract.ocds_id || null,
        contract.submission_deadline || null,
        assignedTo,
        req.session.userId,
        contract.id,
      ]
    );
    const prospect = insertResult.rows[0];

    await pool.query(
      `INSERT INTO pipeline_notes (pipeline_id, note, note_type, created_by) VALUES ($1, 'Added from Contracts Prospected', 'system', $2)`,
      [prospect.id, req.session.userId]
    );

    await logActivity(req.session.userId, 'added prospect from prospected', 'pipeline', prospect.id, {
      company_name: prospect.company_name,
      tender_title: prospect.tender_title,
    });

    return res.status(201).json(prospect);
  } catch (err) {
    console.error('Add from prospected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/pipeline
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT sp.*, u.name as created_by_name
      FROM sales_pipeline sp
      LEFT JOIN users u ON sp.created_by = u.id
      WHERE sp.status NOT IN ('agreed', 'not_interested')
    `;
    const params = [];
    if (status) {
      params.push(status);
      query += ` AND sp.status = $${params.length}`;
    }
    query += ` ORDER BY sp.next_followup_date ASC NULLS LAST, sp.created_at DESC`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('List pipeline error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pipeline
router.post('/', async (req, res) => {
  const {
    company_name, contact_name, email, phone, website, sector, region,
    tender_url, tender_title, tender_reference, tender_value,
    submission_deadline, award_date, buyer,
    status, assigned_to, last_contact_date, next_followup_date,
  } = req.body;

  if (!company_name || !String(company_name).trim()) {
    return res.status(400).json({ error: 'company_name is required' });
  }

  // Convert empty strings to null for dates and numerics
  const safeDate = (v) => (v && String(v).trim()) ? v : null;
  const safeNum = (v) => (v !== null && v !== undefined && String(v).trim() !== '') ? v : null;

  try {
    // Duplicate tender_url check
    const tenderUrlVal = safeDate(tender_url);
    if (tenderUrlVal) {
      const existing = await pool.query(
        'SELECT id, company_name FROM sales_pipeline WHERE tender_url = $1',
        [tenderUrlVal]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: `This tender is already in the pipeline for ${existing.rows[0].company_name}`,
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO sales_pipeline
        (company_name, contact_name, email, phone, website, sector, region,
         tender_url, tender_title, tender_reference, tender_value,
         submission_deadline, award_date, buyer,
         status, assigned_to, last_contact_date, next_followup_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
         COALESCE($17, CURRENT_DATE),
         COALESCE($18, CURRENT_DATE + INTERVAL '3 days'),
         $19)
       RETURNING *`,
      [
        String(company_name).trim(),
        safeDate(contact_name),
        safeDate(email),
        safeDate(phone),
        safeDate(website),
        safeDate(sector),
        safeDate(region),
        tenderUrlVal,
        safeDate(tender_title),
        safeDate(tender_reference),
        safeNum(tender_value),
        safeDate(submission_deadline),
        safeDate(award_date),
        safeDate(buyer),
        status || 'contacted',
        safeDate(assigned_to),
        safeDate(last_contact_date),
        safeDate(next_followup_date),
        req.session.userId,
      ]
    );
    const prospect = result.rows[0];

    await pool.query(
      `INSERT INTO pipeline_notes (pipeline_id, note, note_type, created_by) VALUES ($1, 'Prospect added to pipeline', 'system', $2)`,
      [prospect.id, req.session.userId]
    );

    await logActivity(req.session.userId, 'added prospect', 'pipeline', prospect.id, {
      company_name: prospect.company_name,
      tender_title: prospect.tender_title,
    });

    return res.status(201).json(prospect);
  } catch (err) {
    console.error('Create pipeline prospect error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pipeline/:id/advance
router.post('/:id/advance', async (req, res) => {
  try {
    const current = await pool.query('SELECT * FROM sales_pipeline WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    const prospect = current.rows[0];
    const nextStatus = ADVANCE_MAP[prospect.status];
    if (!nextStatus) {
      return res.status(400).json({ error: 'Cannot advance from current status' });
    }

    const nextFollowup = nextStatus === 'agreed' ? null : 'CURRENT_DATE + INTERVAL \'3 days\'';

    const result = await pool.query(
      `UPDATE sales_pipeline SET
        status = $1,
        last_contact_date = CURRENT_DATE,
        next_followup_date = ${nextStatus === 'agreed' ? 'NULL' : "CURRENT_DATE + INTERVAL '3 days'"},
        updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [nextStatus, req.params.id]
    );
    const updated = result.rows[0];

    await pool.query(
      `INSERT INTO pipeline_notes (pipeline_id, note, note_type, created_by)
       VALUES ($1, $2, 'system', $3)`,
      [
        prospect.id,
        `Status changed from ${STATUS_LABELS[prospect.status] || prospect.status} to ${STATUS_LABELS[nextStatus] || nextStatus}`,
        req.session.userId,
      ]
    );

    await logActivity(req.session.userId, 'advanced prospect', 'pipeline', prospect.id, {
      company_name: prospect.company_name,
      previous_status: prospect.status,
      new_status: nextStatus,
    });

    return res.json(updated);
  } catch (err) {
    console.error('Advance pipeline error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pipeline/:id/promote
router.post('/:id/promote', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch the pipeline row
    const prospectResult = await client.query('SELECT * FROM sales_pipeline WHERE id = $1', [req.params.id]);
    if (!prospectResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Prospect not found' });
    }
    const prospect = prospectResult.rows[0];
    if (prospect.status !== 'agreed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Prospect must be at agreed status to promote' });
    }

    // 2. Check if client already exists
    let clientId;
    const existingClient = await client.query(
      'SELECT id FROM clients WHERE LOWER(company_name) = LOWER($1)',
      [prospect.company_name]
    );
    if (existingClient.rows.length > 0) {
      clientId = existingClient.rows[0].id;
    } else {
      // 3. Create the client
      const clientResult = await client.query(
        `INSERT INTO clients
          (company_name, contact_name, email, phone, website, sector, region, status, account_manager, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active_client',$8,$9)
         RETURNING id`,
        [
          prospect.company_name,
          prospect.contact_name || null,
          prospect.email || null,
          prospect.phone || null,
          prospect.website || null,
          prospect.sector || null,
          prospect.region || null,
          prospect.assigned_to || null,
          req.session.userId,
        ]
      );
      clientId = clientResult.rows[0].id;
    }

    // 4. Calculate evia_fee
    const eviaFee = prospect.tender_value
      ? Math.max(Number(prospect.tender_value) * 0.03, 2000)
      : null;

    // 5. Create the tender
    const tenderResult = await client.query(
      `INSERT INTO tenders
        (client_id, title, buyer, estimated_value, evia_fee, submission_deadline, award_date,
         reference_number, tender_url, status, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'questionnaire_sent',$10,$11)
       RETURNING id`,
      [
        clientId,
        prospect.tender_title || 'Untitled Tender',
        prospect.buyer || null,
        prospect.tender_value || null,
        eviaFee,
        prospect.submission_deadline || null,
        prospect.award_date || null,
        prospect.tender_reference || null,
        prospect.tender_url || null,
        prospect.assigned_to || null,
        req.session.userId,
      ]
    );
    const tenderId = tenderResult.rows[0].id;

    // 6. Delete the pipeline row (pipeline_notes cascade automatically)
    await client.query('DELETE FROM sales_pipeline WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');

    await logActivity(req.session.userId, 'promoted prospect to client and tender', 'pipeline', prospect.id, {
      company_name: prospect.company_name,
      client_id: clientId,
      tender_id: tenderId,
    });

    return res.json({ success: true, client_id: clientId, tender_id: tenderId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Promote error:', err);
    return res.status(500).json({ error: 'Failed to promote prospect' });
  } finally {
    client.release();
  }
});

// POST /api/pipeline/:id/not-interested
router.post('/:id/not-interested', async (req, res) => {
  try {
    const current = await pool.query('SELECT * FROM sales_pipeline WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    const prospect = current.rows[0];

    const result = await pool.query(
      `UPDATE sales_pipeline SET status = 'not_interested', next_followup_date = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    await pool.query(
      `INSERT INTO pipeline_notes (pipeline_id, note, note_type, created_by) VALUES ($1, 'Marked as not interested', 'system', $2)`,
      [prospect.id, req.session.userId]
    );

    await logActivity(req.session.userId, 'marked prospect not interested', 'pipeline', prospect.id, {
      company_name: prospect.company_name,
      tender_title: prospect.tender_title,
    });

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Not interested error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/pipeline/:id/notes
router.get('/:id/notes', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pn.*, u.name as created_by_name
       FROM pipeline_notes pn
       LEFT JOIN users u ON pn.created_by = u.id
       WHERE pn.pipeline_id = $1
       ORDER BY pn.created_at DESC`,
      [req.params.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Get notes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pipeline/:id/notes
router.post('/:id/notes', async (req, res) => {
  const { note } = req.body;
  if (!note || !String(note).trim()) {
    return res.status(400).json({ error: 'note is required' });
  }

  try {
    const existing = await pool.query('SELECT id FROM sales_pipeline WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    const result = await pool.query(
      `INSERT INTO pipeline_notes (pipeline_id, note, note_type, created_by)
       VALUES ($1, $2, 'manual', $3)
       RETURNING *`,
      [req.params.id, String(note).trim(), req.session.userId]
    );
    const newNote = result.rows[0];

    // Join user name for response
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.session.userId]);
    newNote.created_by_name = userResult.rows[0] ? userResult.rows[0].name : null;

    return res.json(newNote);
  } catch (err) {
    console.error('Add note error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/pipeline/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sp.*, u.name as created_by_name
       FROM sales_pipeline sp
       LEFT JOIN users u ON sp.created_by = u.id
       WHERE sp.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Get pipeline prospect error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/pipeline/:id
router.put('/:id', async (req, res) => {
  try {
    const current = await pool.query('SELECT * FROM sales_pipeline WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    const prev = current.rows[0];

    const {
      company_name, contact_name, email, phone, website, sector, region,
      tender_url, tender_title, tender_reference, tender_value,
      submission_deadline, award_date, buyer,
      status, assigned_to, last_contact_date, next_followup_date,
    } = req.body;

    const safeDate = (v) => (v && String(v).trim()) ? v : null;
    const safeNum = (v) => (v !== null && v !== undefined && String(v).trim() !== '') ? v : null;

    const result = await pool.query(
      `UPDATE sales_pipeline SET
        company_name = $1, contact_name = $2, email = $3, phone = $4, website = $5,
        sector = $6, region = $7, tender_url = $8, tender_title = $9, tender_reference = $10,
        tender_value = $11, submission_deadline = $12, award_date = $13, buyer = $14,
        status = $15, assigned_to = $16, last_contact_date = $17, next_followup_date = $18,
        updated_at = NOW()
       WHERE id = $19
       RETURNING *`,
      [
        company_name ? String(company_name).trim() : prev.company_name,
        safeDate(contact_name),
        safeDate(email),
        safeDate(phone),
        safeDate(website),
        safeDate(sector),
        safeDate(region),
        safeDate(tender_url),
        safeDate(tender_title),
        safeDate(tender_reference),
        safeNum(tender_value),
        safeDate(submission_deadline),
        safeDate(award_date),
        safeDate(buyer),
        status || prev.status,
        safeDate(assigned_to),
        safeDate(last_contact_date),
        safeDate(next_followup_date),
        req.params.id,
      ]
    );
    const updated = result.rows[0];

    if (status && status !== prev.status) {
      await pool.query(
        `INSERT INTO pipeline_notes (pipeline_id, note, note_type, created_by) VALUES ($1, $2, 'system', $3)`,
        [
          updated.id,
          `Status changed from ${STATUS_LABELS[prev.status] || prev.status} to ${STATUS_LABELS[status] || status}`,
          req.session.userId,
        ]
      );
      await logActivity(req.session.userId, 'updated prospect status', 'pipeline', updated.id, {
        company_name: updated.company_name,
        previous_status: prev.status,
        new_status: status,
      });
    } else {
      const trackFields = [
        'company_name', 'contact_name', 'email', 'phone', 'website', 'sector', 'region',
        'tender_url', 'tender_title', 'tender_reference', 'tender_value',
        'submission_deadline', 'award_date', 'buyer', 'assigned_to',
        'last_contact_date', 'next_followup_date',
      ];
      const fieldsChanged = trackFields.filter(f => String(prev[f] || '') !== String(updated[f] || ''));
      await logActivity(req.session.userId, 'updated prospect', 'pipeline', updated.id, {
        company_name: updated.company_name,
        fields_changed: fieldsChanged,
      });
    }

    return res.json(updated);
  } catch (err) {
    console.error('Update pipeline prospect error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/pipeline/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM sales_pipeline WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    const prospect = existing.rows[0];

    await pool.query('DELETE FROM sales_pipeline WHERE id = $1', [req.params.id]);

    await logActivity(req.session.userId, 'deleted prospect', 'pipeline', parseInt(req.params.id), {
      company_name: prospect.company_name,
      tender_title: prospect.tender_title,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete pipeline prospect error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
