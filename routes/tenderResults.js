const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

const ALLOWED_OUTCOMES = ['Won', 'Lost', 'Awaiting'];

function normaliseBody(b) {
  return {
    tender_name: (b.tender_name || '').trim(),
    client_name: b.client_name || null,
    contracting_authority: b.contracting_authority || null,
    estimated_budget: b.estimated_budget === '' || b.estimated_budget == null ? null : b.estimated_budget,
    our_price: b.our_price === '' || b.our_price == null ? null : b.our_price,
    bids_received: b.bids_received === '' || b.bids_received == null ? null : b.bids_received,
    winning_price: b.winning_price === '' || b.winning_price == null ? null : b.winning_price,
    quality_price_weighting: b.quality_price_weighting || null,
    outcome: ALLOWED_OUTCOMES.includes(b.outcome) ? b.outcome : 'Awaiting',
    position: b.position === '' || b.position == null ? null : b.position,
    submitted_date: b.submitted_date || null,
    notes: b.notes || null,
    tender_url: b.tender_url ? String(b.tender_url).trim() || null : null,
  };
}

// GET /api/tender-results
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tender_results ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    if (err && err.code === '42P01') {
      // table does not exist yet - return empty list rather than crash
      return res.json([]);
    }
    console.error('List tender results error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tender-results
router.post('/', async (req, res) => {
  const data = normaliseBody(req.body);
  if (!data.tender_name) {
    return res.status(400).json({ error: 'tender_name is required' });
  }
  try {
    const createdBy = (req.session && req.session.userName) || null;
    const { rows } = await pool.query(
      `INSERT INTO tender_results
        (tender_name, client_name, contracting_authority, estimated_budget, our_price,
         bids_received, winning_price, quality_price_weighting, outcome, position,
         submitted_date, notes, tender_url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        data.tender_name,
        data.client_name,
        data.contracting_authority,
        data.estimated_budget,
        data.our_price,
        data.bids_received,
        data.winning_price,
        data.quality_price_weighting,
        data.outcome,
        data.position,
        data.submitted_date,
        data.notes,
        data.tender_url,
        createdBy,
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create tender result error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tender-results/:id
router.put('/:id', async (req, res) => {
  const data = normaliseBody(req.body);
  if (!data.tender_name) {
    return res.status(400).json({ error: 'tender_name is required' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE tender_results SET
         tender_name = $1,
         client_name = $2,
         contracting_authority = $3,
         estimated_budget = $4,
         our_price = $5,
         bids_received = $6,
         winning_price = $7,
         quality_price_weighting = $8,
         outcome = $9,
         position = $10,
         submitted_date = $11,
         notes = $12,
         tender_url = $13,
         updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        data.tender_name,
        data.client_name,
        data.contracting_authority,
        data.estimated_budget,
        data.our_price,
        data.bids_received,
        data.winning_price,
        data.quality_price_weighting,
        data.outcome,
        data.position,
        data.submitted_date,
        data.notes,
        data.tender_url,
        req.params.id,
      ]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Result not found' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('Update tender result error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tender-results/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM tender_results WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Result not found' });
    }
    return res.json({ message: 'Result deleted' });
  } catch (err) {
    console.error('Delete tender result error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
