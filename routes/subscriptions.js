const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

const OWNERS = new Set(['evia_consultancy', 'vlad', 'tristan']);
const CYCLES = new Set(['monthly', 'quarterly', 'annual']);
const STATUSES = new Set(['active', 'paused', 'cancelled']);
const MONTHS_PER_CYCLE = { monthly: 1, quarterly: 3, annual: 12 };

// Pure calculation, run on every GET. Anchor is a yyyy-mm-dd string
// (never a Date object) to avoid the timezone shift node-postgres
// introduces when it parses a raw DATE column. Day-of-month is
// clamped so 29/30/31 anchors survive shorter months. Do not
// migrate this to a scheduled job or startup task - Railway can
// idle for days and the cache would go stale.
function computeNextRenewal(anchorYmd, cycle) {
  const monthsPerCycle = MONTHS_PER_CYCLE[cycle];
  const [ay, am, ad] = anchorYmd.split('-').map(Number);
  const now = new Date();
  const ty = now.getFullYear();
  const tm = now.getMonth() + 1;
  const td = now.getDate();

  let y = ay;
  let m = am;
  for (let i = 0; i < 600; i++) {
    const daysInMonth = new Date(y, m, 0).getDate();
    const d = Math.min(ad, daysInMonth);
    const isFutureOrToday =
      y > ty || (y === ty && (m > tm || (m === tm && d >= td)));
    if (isFutureOrToday) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    m += monthsPerCycle;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
  }
  return null;
}

function monthlyEquivalent(amount, cycle) {
  if (cycle === 'quarterly') return amount / 3;
  if (cycle === 'annual') return amount / 12;
  return amount;
}

// Select renewal_anchor_date as TEXT via TO_CHAR - node-postgres
// otherwise returns a JS Date and reintroduces timezone shifting.
// amount comes back as a string from NUMERIC; parseFloat before any
// arithmetic, or the KPI sums will string-concatenate.
const SELECT_ALL = `
  SELECT
    id,
    service_name,
    owner,
    category,
    amount,
    billing_cycle,
    TO_CHAR(renewal_anchor_date, 'YYYY-MM-DD') AS renewal_anchor_date,
    payment_method,
    management_url,
    account_email,
    status,
    notes,
    created_at,
    updated_at
  FROM subscriptions
`;

function decorate(row) {
  const amount = parseFloat(row.amount);
  const next_renewal_date = computeNextRenewal(row.renewal_anchor_date, row.billing_cycle);
  const monthly_equivalent = monthlyEquivalent(amount, row.billing_cycle);
  return {
    ...row,
    amount,
    next_renewal_date,
    monthly_equivalent,
  };
}

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const {
    service_name,
    owner,
    category,
    amount,
    billing_cycle,
    renewal_anchor_date,
    payment_method,
    management_url,
    account_email,
    status,
    notes,
  } = body || {};

  if (!partial || service_name !== undefined) {
    if (typeof service_name !== 'string' || !service_name.trim()) {
      errors.push('service_name is required');
    }
  }
  if (!partial || owner !== undefined) {
    if (!OWNERS.has(owner)) errors.push('owner must be evia_consultancy, vlad or tristan');
  }
  if (!partial || amount !== undefined) {
    const n = typeof amount === 'number' ? amount : parseFloat(amount);
    if (!Number.isFinite(n) || n < 0) errors.push('amount must be a non-negative number');
  }
  if (!partial || billing_cycle !== undefined) {
    if (!CYCLES.has(billing_cycle)) errors.push('billing_cycle must be monthly, quarterly or annual');
  }
  if (!partial || renewal_anchor_date !== undefined) {
    if (typeof renewal_anchor_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(renewal_anchor_date)) {
      errors.push('renewal_anchor_date must be a yyyy-mm-dd string');
    }
  }
  if (status !== undefined && !STATUSES.has(status)) {
    errors.push('status must be active, paused or cancelled');
  }

  return {
    errors,
    values: {
      service_name: typeof service_name === 'string' ? service_name.trim() : service_name,
      owner,
      category: category === '' ? null : category ?? null,
      amount: amount === undefined ? undefined : (typeof amount === 'number' ? amount : parseFloat(amount)),
      billing_cycle,
      renewal_anchor_date,
      payment_method: payment_method && String(payment_method).trim() ? String(payment_method).trim() : 'Tide Business',
      management_url: management_url === '' ? null : management_url ?? null,
      account_email: account_email === '' ? null : account_email ?? null,
      status: status ?? 'active',
      notes: notes === '' ? null : notes ?? null,
    },
  };
}

// GET /api/subscriptions
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(`${SELECT_ALL} ORDER BY owner, service_name`);
    return res.json(result.rows.map(decorate));
  } catch (err) {
    console.error('List subscriptions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/subscriptions
router.post('/', async (req, res) => {
  const { errors, values } = validatePayload(req.body);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });

  try {
    const result = await pool.query(
      `INSERT INTO subscriptions
         (service_name, owner, category, amount, billing_cycle, renewal_anchor_date,
          payment_method, management_url, account_email, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        values.service_name,
        values.owner,
        values.category,
        values.amount,
        values.billing_cycle,
        values.renewal_anchor_date,
        values.payment_method,
        values.management_url,
        values.account_email,
        values.status,
        values.notes,
      ],
    );
    const { rows } = await pool.query(`${SELECT_ALL} WHERE id = $1`, [result.rows[0].id]);
    return res.status(201).json(decorate(rows[0]));
  } catch (err) {
    console.error('Create subscription error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/subscriptions/:id
router.put('/:id', async (req, res) => {
  const { errors, values } = validatePayload(req.body);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });

  try {
    const existing = await pool.query('SELECT id FROM subscriptions WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Subscription not found' });

    await pool.query(
      `UPDATE subscriptions
         SET service_name        = $1,
             owner               = $2,
             category            = $3,
             amount              = $4,
             billing_cycle       = $5,
             renewal_anchor_date = $6,
             payment_method      = $7,
             management_url      = $8,
             account_email       = $9,
             status              = $10,
             notes               = $11,
             updated_at          = now()
       WHERE id = $12`,
      [
        values.service_name,
        values.owner,
        values.category,
        values.amount,
        values.billing_cycle,
        values.renewal_anchor_date,
        values.payment_method,
        values.management_url,
        values.account_email,
        values.status,
        values.notes,
        req.params.id,
      ],
    );
    const { rows } = await pool.query(`${SELECT_ALL} WHERE id = $1`, [req.params.id]);
    return res.json(decorate(rows[0]));
  } catch (err) {
    console.error('Update subscription error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/subscriptions/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query('SELECT id FROM subscriptions WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Subscription not found' });
    await pool.query('DELETE FROM subscriptions WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete subscription error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
