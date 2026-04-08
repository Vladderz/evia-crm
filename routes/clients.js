const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

async function logActivity(userId, action, entityId, details) {
  try {
    await pool.query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'client', $3, $4)`,
      [userId, action, entityId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

// GET /api/clients/stats - must be before /:id
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active_client') AS active_client,
        COUNT(*) FILTER (WHERE status = 'seeking_tender') AS seeking_tender,
        COUNT(*) FILTER (WHERE status = 'prospect') AS prospect
      FROM clients
    `);
    const row = result.rows[0];
    return res.json({
      total: parseInt(row.total),
      active_client: parseInt(row.active_client),
      seeking_tender: parseInt(row.seeking_tender),
      prospect: parseInt(row.prospect),
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients/:id/notes - registered before /:id to avoid route conflict
router.get('/:id/notes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cn.*, u.name as created_by_name
       FROM client_notes cn
       LEFT JOIN users u ON cn.created_by = u.id
       WHERE cn.client_id = $1
       ORDER BY cn.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching client notes:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// POST /api/clients/:id/notes - registered before /:id to avoid route conflict
router.post('/:id/notes', async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Note cannot be empty' });
    }

    const client = await pool.query('SELECT id FROM clients WHERE id = $1', [req.params.id]);
    if (client.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO client_notes (client_id, note, note_type, created_by)
       VALUES ($1, $2, 'manual', $3) RETURNING *`,
      [req.params.id, note.trim(), req.session.userId]
    );

    const user = await pool.query('SELECT name FROM users WHERE id = $1', [req.session.userId]);
    const result = { ...rows[0], created_by_name: user.rows[0]?.name || 'Unknown' };

    res.status(201).json(result);
  } catch (err) {
    console.error('Error adding client note:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, u.name AS created_by_name,
        latest_note.note AS latest_note_text,
        latest_note.created_at AS latest_note_date,
        latest_note.note_type AS latest_note_type
      FROM clients c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN LATERAL (
        SELECT note, created_at, note_type
        FROM client_notes
        WHERE client_notes.client_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) latest_note ON true
      ORDER BY c.updated_at DESC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error('List clients error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS created_by_name
       FROM clients c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Client not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Get client error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients
router.post('/', async (req, res) => {
  const {
    company_name, contact_name, email, phone, website,
    sector, region, status, notes, account_manager,
  } = req.body;

  if (!company_name) {
    return res.status(400).json({ error: 'company_name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO clients
        (company_name, contact_name, email, phone, website, sector, region, status, notes, account_manager, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [company_name, contact_name || null, email || null, phone || null, website || null,
       sector || null, region || null, status || 'prospect', notes || null,
       account_manager || 'vlad', req.session.userId]
    );
    const client = result.rows[0];
    await logActivity(req.session.userId, 'added client', client.id, { company_name });
    await pool.query(
      `INSERT INTO client_notes (client_id, note, note_type, created_by) VALUES ($1, 'Client added', 'system', $2)`,
      [client.id, req.session.userId]
    );
    return res.status(201).json(client);
  } catch (err) {
    console.error('Create client error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clients/:id
router.put('/:id', async (req, res) => {
  const {
    company_name, contact_name, email, phone, website,
    sector, region, status, notes, account_manager,
  } = req.body;

  if (!company_name) {
    return res.status(400).json({ error: 'company_name is required' });
  }

  try {
    // Track which fields changed for the activity log
    const existing = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const prev = existing.rows[0];
    const fieldsChanged = [];
    const fields = { company_name, contact_name, email, phone, website, sector, region, status, notes, account_manager };
    for (const [key, val] of Object.entries(fields)) {
      if ((val || null) !== (prev[key] || null)) fieldsChanged.push(key);
    }

    const result = await pool.query(
      `UPDATE clients SET
        company_name    = $1,
        contact_name    = $2,
        email           = $3,
        phone           = $4,
        website         = $5,
        sector          = $6,
        region          = $7,
        status          = $8,
        notes           = $9,
        account_manager = $10
       WHERE id = $11
       RETURNING *`,
      [company_name, contact_name || null, email || null, phone || null, website || null,
       sector || null, region || null, status || 'prospect', notes || null,
       account_manager || 'vlad', req.params.id]
    );

    const client = result.rows[0];
    await logActivity(req.session.userId, 'updated client', client.id, {
      company_name: client.company_name,
      fields_changed: fieldsChanged,
    });

    const newStatus = status || 'prospect';
    if (prev.status !== newStatus) {
      const CLIENT_STATUS_LABELS = {
        active_client: 'Active Client',
        prospect: 'Prospect',
        seeking_tender: 'Seeking Tender',
      };
      const oldLabel = CLIENT_STATUS_LABELS[prev.status] || prev.status;
      const newLabel = CLIENT_STATUS_LABELS[newStatus] || newStatus;
      await pool.query(
        `INSERT INTO client_notes (client_id, note, note_type, created_by) VALUES ($1, $2, 'system', $3)`,
        [req.params.id, `Status changed from ${oldLabel} to ${newLabel}`, req.session.userId]
      );
    }

    return res.json(client);
  } catch (err) {
    console.error('Update client error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res) => {
  try {
    const clientResult = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (!clientResult.rows[0]) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const client = clientResult.rows[0];

    const tenderCount = await pool.query(
      'SELECT COUNT(*) FROM tenders WHERE client_id = $1',
      [req.params.id]
    );
    const linkedTenders = parseInt(tenderCount.rows[0].count);

    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);

    const logDetails = { company_name: client.company_name };
    if (linkedTenders > 0) {
      logDetails.note = `${linkedTenders} linked tender(s) unlinked`;
    }
    await logActivity(req.session.userId, 'deleted client', parseInt(req.params.id), logDetails);

    return res.json({ message: 'Client deleted' });
  } catch (err) {
    console.error('Delete client error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
