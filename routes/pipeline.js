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

// Canonical labels live in client/src/lib/format.ts
// (PROSPECT_STATUS_LABELS). Duplicated here because there is no shared
// module across the client/server boundary - keep in sync on rename.
const STATUS_LABELS = {
  contacted:    'Contacted',
  call_booked:  'Call Booked',
  waiting_room: 'Waiting Room',
};

// Single-step advance chain: call_booked -> waiting_room. New
// prospects enter at Call Booked so there is no advance from
// 'contacted' any more (the 34 historical contacted rows all live in
// No Man's Land). From waiting_room (or from call_booked, if the
// client commits during the call) the next step is /promote, not
// /advance.
const ADVANCE_MAP = {
  call_booked: 'waiting_room',
};

const DROP_REASONS = [
  'not_interested', 'went_with_other', 'price_concern',
  'ghosted', 'timing', 'other',
];

const DROP_REASON_LABELS = {
  not_interested:  'Not interested in this tender',
  went_with_other: 'Went with another bid writer',
  price_concern:   'Price / fee concern',
  ghosted:         'Ghosted / no response',
  timing:          'Timing wrong',
  other:           'Other',
};

// GET /api/pipeline/stats
router.get('/stats', async (req, res) => {
  try {
    const [pipelineRow, activityRow] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE dropped_at IS NULL) as active_prospects,
          COUNT(*) FILTER (WHERE dropped_at IS NULL AND status = 'contacted') as contacted,
          COUNT(*) FILTER (WHERE dropped_at IS NULL AND status = 'call_booked') as call_booked,
          COUNT(*) FILTER (WHERE dropped_at IS NULL AND status = 'waiting_room') as waiting_room,
          COUNT(*) FILTER (WHERE dropped_at IS NULL AND next_followup_date <= CURRENT_DATE) as overdue_followups,
          COUNT(*) FILTER (WHERE dropped_at >= NOW() - INTERVAL '30 days') as dropped_30d
        FROM sales_pipeline
      `),
      pool.query(`
        SELECT COUNT(*)::int AS converted_30d
        FROM activity_log
        WHERE entity_type = 'pipeline'
          AND action = 'promoted prospect to client and tender'
          AND created_at >= NOW() - INTERVAL '30 days'
      `),
    ]);
    const row = pipelineRow.rows[0];
    const converted_30d = activityRow.rows[0]?.converted_30d ?? 0;
    return res.json({
      active_prospects: parseInt(row.active_prospects) || 0,
      contacted:        parseInt(row.contacted) || 0,
      call_booked:      parseInt(row.call_booked) || 0,
      waiting_room:     parseInt(row.waiting_room) || 0,
      overdue_followups: parseInt(row.overdue_followups) || 0,
      dropped_30d:      parseInt(row.dropped_30d) || 0,
      converted_30d:    converted_30d,
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
       VALUES ($1, $2, $3, $4, $5, 'call_booked', CURRENT_DATE, CURRENT_DATE + INTERVAL '3 days', $6, $7, $8)
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
      SELECT sp.*, u.name as created_by_name,
        latest_note.note AS latest_note_text,
        latest_note.created_at AS latest_note_date,
        latest_note.note_type AS latest_note_type
      FROM sales_pipeline sp
      LEFT JOIN users u ON sp.created_by = u.id
      LEFT JOIN LATERAL (
        SELECT note, created_at, note_type
        FROM pipeline_notes
        WHERE pipeline_notes.pipeline_id = sp.id
        ORDER BY created_at DESC
        LIMIT 1
      ) latest_note ON true
      WHERE sp.dropped_at IS NULL
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
        status || 'call_booked',
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

    const result = await pool.query(
      `UPDATE sales_pipeline SET
        status = $1,
        last_contact_date = CURRENT_DATE,
        next_followup_date = CURRENT_DATE + INTERVAL '3 days',
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
    if ((prospect.status !== 'call_booked' && prospect.status !== 'waiting_room') || prospect.dropped_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Prospect must be at Call Booked or Waiting Room stage and not dropped to push to Active Tenders',
      });
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

// POST /api/pipeline/:id/drop
// Move a prospect into No Man's Land. Sets dropped_at + drop_reason
// + drop_note. Status is preserved as the "stage when dropped".
router.post('/:id/drop', async (req, res) => {
  const { reason, note } = req.body || {};
  if (!DROP_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'Invalid drop reason' });
  }
  try {
    const current = await pool.query('SELECT * FROM sales_pipeline WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    const prospect = current.rows[0];
    if (prospect.dropped_at) {
      return res.status(400).json({ error: 'Prospect is already dropped' });
    }

    const trimmedNote = typeof note === 'string' ? note.trim() : '';
    const result = await pool.query(
      `UPDATE sales_pipeline SET
        dropped_at = NOW(),
        drop_reason = $1,
        drop_note = $2,
        next_followup_date = NULL,
        updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [reason, trimmedNote || null, req.params.id]
    );

    const reasonLabel = DROP_REASON_LABELS[reason] || reason;
    const systemNote = trimmedNote
      ? `Dropped to No Man's Land: ${reasonLabel}. ${trimmedNote}`
      : `Dropped to No Man's Land: ${reasonLabel}.`;
    await pool.query(
      `INSERT INTO pipeline_notes (pipeline_id, note, note_type, created_by)
       VALUES ($1, $2, 'system', $3)`,
      [prospect.id, systemNote, req.session.userId]
    );

    await logActivity(req.session.userId, 'dropped prospect', 'pipeline', prospect.id, {
      company_name: prospect.company_name,
      stage_when_dropped: prospect.status,
      reason,
      note: trimmedNote || null,
    });

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Drop prospect error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pipeline/:id/re-engage
// Pull a prospect out of No Man's Land back into Sales Pipeline.
// Status is reset to 'contacted'. drop_reason / drop_note are kept on
// the row as historical context. (To push the row into Active Tenders
// instead, call /promote - that flow handles client + tender creation
// and deletes the pipeline row.)
router.post('/:id/re-engage', async (req, res) => {
  try {
    const current = await pool.query('SELECT * FROM sales_pipeline WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    const prospect = current.rows[0];
    if (!prospect.dropped_at) {
      return res.status(400).json({ error: 'Prospect is not dropped' });
    }

    const result = await pool.query(
      `UPDATE sales_pipeline SET
        dropped_at = NULL,
        status = 'contacted',
        last_contact_date = CURRENT_DATE,
        next_followup_date = CURRENT_DATE + INTERVAL '3 days',
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    const reasonLabel = DROP_REASON_LABELS[prospect.drop_reason] || prospect.drop_reason || 'unknown';
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    await pool.query(
      `INSERT INTO pipeline_notes (pipeline_id, note, note_type, created_by)
       VALUES ($1, $2, 'system', $3)`,
      [
        prospect.id,
        `Re-engaged on ${today} from No Man's Land. Original drop reason: ${reasonLabel}.`,
        req.session.userId,
      ]
    );

    await logActivity(req.session.userId, 're-engaged prospect', 'pipeline', prospect.id, {
      company_name: prospect.company_name,
      original_drop_reason: prospect.drop_reason,
    });

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Re-engage prospect error:', err);
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
