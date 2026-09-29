const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

/* ---------------------------------------------------------------- *
 * Category enum + shared helpers                                    *
 * ---------------------------------------------------------------- */

const CATEGORIES = ['success_fee', 'fixed_fee', 'retainer', 'other'];

// Every date column is selected as text (YYYY-MM-DD) rather than the
// default node-postgres Date so no calendar day ever shifts across time
// zones on the way to the browser. Same technique subscriptions uses.
const INVOICE_SELECT = `
  i.id,
  i.invoice_number,
  i.category,
  i.tender_id,
  i.client_id,
  i.client_name,
  i.description,
  i.contract_label,
  i.net_amount,
  i.vat_amount,
  (i.net_amount + i.vat_amount) AS total,
  i.issue_date::text  AS issue_date,
  i.due_date::text    AS due_date,
  i.paid_date::text   AS paid_date,
  i.amount_received,
  i.tide_transaction_id,
  i.invoice_file,
  i.payment_evidence_file,
  i.notes,
  i.voided_at,
  i.void_reason,
  i.created_by,
  i.created_at,
  i.updated_at,
  t.title             AS tender_title,
  t.procurement_type  AS tender_type,
  t.status            AS tender_status,
  t.won_at::text      AS tender_won_at,
  CASE
    WHEN i.paid_date IS NOT NULL AND i.issue_date IS NOT NULL
      THEN (i.paid_date - i.issue_date)
    ELSE NULL
  END AS days_to_pay,
  CASE
    WHEN i.voided_at IS NOT NULL THEN 'void'
    WHEN i.paid_date IS NOT NULL THEN 'paid'
    WHEN i.due_date IS NOT NULL AND i.due_date < (now() AT TIME ZONE 'Europe/London')::date THEN 'overdue'
    ELSE 'awaiting'
  END AS state,
  CASE
    WHEN i.voided_at IS NULL AND i.paid_date IS NULL AND i.due_date IS NOT NULL
      AND i.due_date < (now() AT TIME ZONE 'Europe/London')::date
    THEN ((now() AT TIME ZONE 'Europe/London')::date - i.due_date)
    ELSE NULL
  END AS days_overdue,
  CASE
    WHEN i.voided_at IS NULL AND i.paid_date IS NULL AND i.due_date IS NOT NULL
      AND i.due_date >= (now() AT TIME ZONE 'Europe/London')::date
    THEN (i.due_date - (now() AT TIME ZONE 'Europe/London')::date)
    ELSE NULL
  END AS days_until_due
`;

async function fetchInvoiceById(id) {
  const { rows } = await pool.query(
    `SELECT ${INVOICE_SELECT}
     FROM invoices i
     LEFT JOIN tenders t ON i.tender_id = t.id
     WHERE i.id = $1`,
    [id],
  );
  return rows[0] || null;
}

function trimOrNull(v) {
  if (typeof v !== 'string') return v == null ? null : v;
  const s = v.trim();
  return s === '' ? null : s;
}

function parseMoney(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100) / 100;
}

function isValidYmd(s) {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Roundtrip check to catch impossible days like 2026-02-30. Uses
  // Date.UTC so no local timezone drift.
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year
    && dt.getUTCMonth() === month - 1
    && dt.getUTCDate() === day;
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function compareYmd(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/* ---------------------------------------------------------------- *
 * Validation                                                        *
 * ---------------------------------------------------------------- */

// Given a "resolved" invoice (defaults applied, present fields merged),
// return a validation error message or null if valid.
function validateResolved(row, { requireIssue }) {
  if (!CATEGORIES.includes(row.category)) return 'Invalid category';
  if (row.client_id == null && (!row.client_name || !row.client_name.trim())) {
    return 'Client name is required';
  }
  if (!row.description || !row.description.trim()) return 'Description is required';

  const net = parseMoney(row.net_amount);
  const vat = parseMoney(row.vat_amount);
  if (net === null || Number.isNaN(net) || net < 0) return 'Amounts must be zero or more';
  if (vat === null || Number.isNaN(vat) || vat < 0) return 'Amounts must be zero or more';

  if (requireIssue && !row.issue_date) return 'Enter a valid date';
  if (row.issue_date && !isValidYmd(row.issue_date)) return 'Enter a valid date';
  if (row.due_date && !isValidYmd(row.due_date)) return 'Enter a valid date';
  if (row.paid_date && !isValidYmd(row.paid_date)) return 'Enter a valid date';

  if (row.paid_date && row.issue_date && compareYmd(row.paid_date, row.issue_date) < 0) {
    return `Date paid can't be before the issue date`;
  }

  if (row.amount_received != null && row.amount_received !== '') {
    const ar = parseMoney(row.amount_received);
    if (ar === null || Number.isNaN(ar) || ar < 0) return 'Amounts must be zero or more';
  }

  return null;
}

async function assertRefsExist({ tender_id, client_id }) {
  if (tender_id != null) {
    const { rowCount } = await pool.query('SELECT 1 FROM tenders WHERE id = $1', [tender_id]);
    if (!rowCount) return 'Linked tender not found';
  }
  if (client_id != null) {
    const { rowCount } = await pool.query('SELECT 1 FROM clients WHERE id = $1', [client_id]);
    if (!rowCount) return 'Linked client not found';
  }
  return null;
}

/* ---------------------------------------------------------------- *
 * GET /api/invoices                                                 *
 * ---------------------------------------------------------------- */

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${INVOICE_SELECT}
       FROM invoices i
       LEFT JOIN tenders t ON i.tender_id = t.id
       ORDER BY i.issue_date DESC, i.id DESC`,
    );
    res.json(rows);
  } catch (err) {
    console.error('List invoices error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------------------------------------------------------------- *
 * GET /api/invoices/to-invoice                                      *
 * ---------------------------------------------------------------- */

router.get('/to-invoice', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         t.id,
         t.title,
         t.procurement_type,
         t.evia_fee,
         t.award_date::text AS award_date,
         t.won_at::text     AS won_at,
         t.client_id,
         c.company_name     AS client_name
       FROM tenders t
       LEFT JOIN clients c ON t.client_id = c.id
       WHERE t.status = 'won'
         AND t.dropped_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM invoices i
           WHERE i.tender_id = t.id
             AND i.voided_at IS NULL
         )
       ORDER BY COALESCE(t.won_at, t.award_date) ASC NULLS LAST, t.id ASC`,
    );
    res.json(rows);
  } catch (err) {
    console.error('To-invoice list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------------------------------------------------------------- *
 * GET /api/invoices/next-number                                     *
 * ---------------------------------------------------------------- */

router.get('/next-number', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT invoice_number
       FROM invoices
       WHERE invoice_number ~ '^INV-[0-9]+$'`,
    );
    let maxN = 0;
    for (const r of rows) {
      const m = /^INV-(\d+)$/.exec(r.invoice_number);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    }
    const next = `INV-${String(maxN + 1).padStart(3, '0')}`;
    res.json({ next });
  } catch (err) {
    console.error('Next invoice number error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------------------------------------------------------------- *
 * Duplicate-number probe                                            *
 * ---------------------------------------------------------------- */

async function invoiceNumberInUse(number, excludeId) {
  if (!number) return false;
  const values = [number];
  let sql = 'SELECT id FROM invoices WHERE invoice_number = $1';
  if (excludeId != null) {
    values.push(excludeId);
    sql += ` AND id <> $${values.length}`;
  }
  sql += ' LIMIT 1';
  const { rowCount } = await pool.query(sql, values);
  return rowCount > 0;
}

/* ---------------------------------------------------------------- *
 * POST /api/invoices                                                *
 * ---------------------------------------------------------------- */

router.post('/', async (req, res) => {
  const b = req.body || {};
  try {
    const invoice_number = trimOrNull(b.invoice_number);
    const category = b.category;
    const tender_id = b.tender_id === '' || b.tender_id == null ? null : parseInt(b.tender_id, 10);
    const client_id = b.client_id === '' || b.client_id == null ? null : parseInt(b.client_id, 10);

    // When a client is picked, derive client_name from that client's
    // company_name and ignore any client_name in the body. Otherwise
    // fall back to the client_name sent by the form.
    let client_name;
    if (client_id != null) {
      const { rows } = await pool.query(
        'SELECT company_name FROM clients WHERE id = $1',
        [client_id],
      );
      client_name = rows[0] ? rows[0].company_name : '';
    } else {
      client_name = typeof b.client_name === 'string' ? b.client_name.trim() : '';
    }

    const description = typeof b.description === 'string' ? b.description.trim() : '';
    // The drawer no longer sends contract_label; the Sales Log falls
    // back to the linked tender's title.
    const contract_label = null;
    const net_amount = parseMoney(b.net_amount);
    const vat_amount = b.vat_amount === '' || b.vat_amount == null ? 0 : parseMoney(b.vat_amount);
    const issue_date = trimOrNull(b.issue_date);
    let due_date = trimOrNull(b.due_date);
    if (!due_date && issue_date && isValidYmd(issue_date)) {
      due_date = addDaysYmd(issue_date, 14);
    }
    const paid_date = trimOrNull(b.paid_date);
    let amount_received;
    if ('amount_received' in b) {
      amount_received = b.amount_received === '' || b.amount_received == null
        ? null : parseMoney(b.amount_received);
    } else if (paid_date) {
      amount_received = Math.round(((net_amount || 0) + (vat_amount || 0)) * 100) / 100;
    } else {
      amount_received = null;
    }
    if (!paid_date) amount_received = null;
    const tide_transaction_id = trimOrNull(b.tide_transaction_id);
    const invoice_file = trimOrNull(b.invoice_file);
    const payment_evidence_file = trimOrNull(b.payment_evidence_file);
    const notes = trimOrNull(b.notes);

    const resolved = {
      invoice_number, category, tender_id, client_id, client_name, description,
      contract_label, net_amount, vat_amount, issue_date, due_date, paid_date,
      amount_received, tide_transaction_id, invoice_file, payment_evidence_file, notes,
    };

    const validationError = validateResolved(resolved, { requireIssue: true });
    if (validationError) return res.status(400).json({ error: validationError });

    const refsError = await assertRefsExist(resolved);
    if (refsError) return res.status(400).json({ error: refsError });

    if (invoice_number && (await invoiceNumberInUse(invoice_number, null))) {
      return res.status(409).json({ error: `${invoice_number} is already used` });
    }

    const { rows } = await pool.query(
      `INSERT INTO invoices (
         invoice_number, category, tender_id, client_id, client_name,
         description, contract_label, net_amount, vat_amount,
         issue_date, due_date, paid_date, amount_received,
         tide_transaction_id, invoice_file, payment_evidence_file, notes,
         created_by
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,$8,$9,
         $10,$11,$12,$13,
         $14,$15,$16,$17,
         $18
       ) RETURNING id`,
      [
        invoice_number, category, tender_id, client_id, client_name,
        description, contract_label, net_amount, vat_amount,
        issue_date, due_date, paid_date, amount_received,
        tide_transaction_id, invoice_file, payment_evidence_file, notes,
        req.session.userId,
      ],
    );

    const saved = await fetchInvoiceById(rows[0].id);
    res.status(201).json(saved);
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: `${req.body?.invoice_number || 'This number'} is already used` });
    }
    console.error('Create invoice error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------------------------------------------------------------- *
 * PUT /api/invoices/:id                                             *
 * ---------------------------------------------------------------- */

router.put('/:id', async (req, res) => {
  try {
    const idNum = parseInt(req.params.id, 10);
    const current = await pool.query('SELECT * FROM invoices WHERE id = $1', [idNum]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const prev = current.rows[0];
    const b = req.body || {};

    // Merge: if key present in body, use it (empty string -> null,
    // except for the required string fields); otherwise keep prev.
    const pick = (key, prevValue, transform = v => v) => {
      if (!(key in b)) return prevValue;
      const raw = b[key];
      if (raw === '' || raw == null) return null;
      return transform(raw);
    };
    const pickText = (key, prevValue) => {
      if (!(key in b)) return prevValue;
      const raw = b[key];
      if (typeof raw !== 'string') return raw;
      const s = raw.trim();
      return s === '' ? null : s;
    };
    const pickRequiredText = (key, prevValue) => {
      if (!(key in b)) return prevValue;
      const raw = b[key];
      return typeof raw === 'string' ? raw.trim() : prevValue;
    };
    const pickInt = (key, prevValue) => {
      if (!(key in b)) return prevValue;
      const raw = b[key];
      if (raw === '' || raw == null) return null;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : prevValue;
    };
    const pickMoney = (key, prevValue) => {
      if (!(key in b)) return prevValue;
      const raw = b[key];
      if (raw === '' || raw == null) return null;
      const n = parseMoney(raw);
      return n;
    };

    const invoice_number = 'invoice_number' in b ? pickText('invoice_number', prev.invoice_number) : prev.invoice_number;
    const category = 'category' in b ? b.category : prev.category;
    const tender_id = pickInt('tender_id', prev.tender_id);
    const client_id = pickInt('client_id', prev.client_id);

    // Only sync client_name from the clients table when the picked
    // client actually changes to a real client. This protects the
    // legal names stored on the seeded invoices from being flattened
    // to the shorter Client Book display name during unrelated edits.
    // When the picker is cleared to "No client", the drawer sends
    // client_name; use that so the on-invoice name can be corrected.
    let client_name = prev.client_name;
    if ('client_id' in b && client_id !== prev.client_id && client_id != null) {
      const { rows } = await pool.query(
        'SELECT company_name FROM clients WHERE id = $1',
        [client_id],
      );
      if (rows[0]) client_name = rows[0].company_name;
    } else if (client_id == null && 'client_name' in b) {
      const raw = b.client_name;
      if (typeof raw === 'string') client_name = raw.trim();
    }

    const description = pickRequiredText('description', prev.description);

    // The drawer no longer sends contract_label. When the linked
    // tender changes, drop the stored label so the Sales Log falls
    // back to the new tender's title. Otherwise leave the stored
    // value alone.
    let contract_label = prev.contract_label;
    if ('tender_id' in b && tender_id !== prev.tender_id) {
      contract_label = null;
    }
    const net_amount = 'net_amount' in b ? pickMoney('net_amount', prev.net_amount) : prev.net_amount;
    let vat_amount = 'vat_amount' in b ? pickMoney('vat_amount', prev.vat_amount) : prev.vat_amount;
    if (vat_amount == null) vat_amount = 0;
    const issue_date = 'issue_date' in b ? pickText('issue_date', prev.issue_date) : (typeof prev.issue_date === 'string' ? prev.issue_date : prev.issue_date?.toISOString().slice(0, 10));

    let due_date;
    if ('due_date' in b) {
      due_date = pickText('due_date', prev.due_date);
      if (!due_date && issue_date && isValidYmd(issue_date)) {
        due_date = addDaysYmd(issue_date, 14);
      }
    } else {
      due_date = typeof prev.due_date === 'string' ? prev.due_date : (prev.due_date ? prev.due_date.toISOString().slice(0, 10) : null);
    }

    const prevPaid = typeof prev.paid_date === 'string'
      ? prev.paid_date
      : (prev.paid_date ? prev.paid_date.toISOString().slice(0, 10) : null);
    const paid_date = 'paid_date' in b ? pickText('paid_date', prevPaid) : prevPaid;

    let amount_received;
    if ('amount_received' in b) {
      amount_received = pickMoney('amount_received', prev.amount_received);
    } else if (paid_date) {
      // The drawer and Mark Paid dialog no longer send amount_received;
      // recompute from the current total so a paid invoice's received
      // amount tracks the total when the amount is edited.
      amount_received = Math.round(
        ((parseMoney(net_amount) || 0) + (parseMoney(vat_amount) || 0)) * 100,
      ) / 100;
    } else {
      amount_received = null;
    }
    if (!paid_date) amount_received = null;

    const tide_transaction_id = pickText('tide_transaction_id', prev.tide_transaction_id);
    const invoice_file = pickText('invoice_file', prev.invoice_file);
    const payment_evidence_file = pickText('payment_evidence_file', prev.payment_evidence_file);
    const notes = pickText('notes', prev.notes);

    const resolved = {
      invoice_number, category, tender_id, client_id, client_name, description,
      contract_label, net_amount, vat_amount, issue_date, due_date, paid_date,
      amount_received, tide_transaction_id, invoice_file, payment_evidence_file, notes,
    };

    const validationError = validateResolved(resolved, { requireIssue: true });
    if (validationError) return res.status(400).json({ error: validationError });

    const refsError = await assertRefsExist(resolved);
    if (refsError) return res.status(400).json({ error: refsError });

    if (invoice_number && invoice_number !== prev.invoice_number
      && (await invoiceNumberInUse(invoice_number, idNum))) {
      return res.status(409).json({ error: `${invoice_number} is already used` });
    }

    await pool.query(
      `UPDATE invoices SET
         invoice_number         = $1,
         category               = $2,
         tender_id              = $3,
         client_id              = $4,
         client_name            = $5,
         description            = $6,
         contract_label         = $7,
         net_amount             = $8,
         vat_amount             = $9,
         issue_date             = $10,
         due_date               = $11,
         paid_date              = $12,
         amount_received        = $13,
         tide_transaction_id    = $14,
         invoice_file           = $15,
         payment_evidence_file  = $16,
         notes                  = $17
       WHERE id = $18`,
      [
        invoice_number, category, tender_id, client_id, client_name,
        description, contract_label, net_amount, vat_amount,
        issue_date, due_date, paid_date, amount_received,
        tide_transaction_id, invoice_file, payment_evidence_file, notes,
        idNum,
      ],
    );

    const saved = await fetchInvoiceById(idNum);
    res.json(saved);
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: `${req.body?.invoice_number || 'This number'} is already used` });
    }
    console.error('Update invoice error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------------------------------------------------------------- *
 * POST /api/invoices/:id/void                                       *
 * ---------------------------------------------------------------- */

router.post('/:id/void', async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) return res.status(400).json({ error: 'Reason is required' });
  try {
    const idNum = parseInt(req.params.id, 10);
    const current = await pool.query('SELECT id FROM invoices WHERE id = $1', [idNum]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    await pool.query(
      `UPDATE invoices SET voided_at = now(), void_reason = $1 WHERE id = $2`,
      [reason, idNum],
    );
    const saved = await fetchInvoiceById(idNum);
    res.json(saved);
  } catch (err) {
    console.error('Void invoice error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------------------------------------------------------------- *
 * POST /api/invoices/:id/restore                                    *
 * ---------------------------------------------------------------- */

router.post('/:id/restore', async (req, res) => {
  try {
    const idNum = parseInt(req.params.id, 10);
    const current = await pool.query('SELECT id FROM invoices WHERE id = $1', [idNum]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    await pool.query(
      `UPDATE invoices SET voided_at = NULL, void_reason = NULL WHERE id = $1`,
      [idNum],
    );
    const saved = await fetchInvoiceById(idNum);
    res.json(saved);
  } catch (err) {
    console.error('Restore invoice error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------------------------------------------------------------- *
 * GET /api/invoices/export.csv                                      *
 * ---------------------------------------------------------------- */

function ymdToDMY(ymd) {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function money2(v) {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

router.get('/export.csv', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${INVOICE_SELECT}
       FROM invoices i
       LEFT JOIN tenders t ON i.tender_id = t.id
       ORDER BY i.issue_date ASC, i.invoice_number ASC, i.id ASC`,
    );

    // Running total of net across non-void rows, in issue order.
    let cumulative = 0;
    const csvRows = rows.map(row => {
      const isVoid = row.state === 'void';
      const net = parseFloat(row.net_amount);
      const vat = parseFloat(row.vat_amount);
      const total = parseFloat(row.total);
      const received = row.amount_received == null ? null : parseFloat(row.amount_received);
      const difference = row.paid_date && received != null
        ? Math.round((received - total) * 100) / 100
        : null;
      let statusLabel;
      if (isVoid) statusLabel = 'Void';
      else if (row.state === 'paid') statusLabel = 'Paid';
      else if (row.state === 'overdue') statusLabel = 'OVERDUE';
      else statusLabel = 'Outstanding';

      if (!isVoid && Number.isFinite(net)) cumulative += net;
      const cumulativeCell = isVoid ? '' : money2(cumulative);

      const tenderOrContract = row.contract_label || row.tender_title || '';

      return [
        row.invoice_number || '',
        ymdToDMY(row.issue_date),
        row.client_name || '',
        row.description || '',
        money2(net),
        money2(vat),
        money2(total),
        ymdToDMY(row.due_date),
        ymdToDMY(row.paid_date),
        received == null ? '' : money2(received),
        difference == null ? '' : money2(difference),
        statusLabel,
        row.tide_transaction_id || '',
        row.invoice_file || '',
        row.payment_evidence_file || '',
        cumulativeCell,
        row.notes || '',
        tenderOrContract,
      ];
    });

    const header = [
      'Invoice No', 'Date Issued', 'Client', 'Description',
      'Net (£)', 'VAT (£)', 'Total (£)',
      'Due Date', 'Date Paid', 'Amount Received (£)', 'Difference (£)',
      'Status', 'Tide Transaction ID', 'Invoice File', 'Payment Evidence File',
      'Cumulative Turnover (£)', 'Notes', 'Tender / Contract',
    ];

    const lines = [header, ...csvRows]
      .map(row => row.map(csvEscape).join(','))
      .join('\r\n');
    const body = '﻿' + lines + '\r\n';

    const { rows: todayRows } = await pool.query(
      `SELECT (now() AT TIME ZONE 'Europe/London')::date::text AS today`,
    );
    const today = todayRows[0].today;
    const filename = `Sales_Log_${today}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  } catch (err) {
    console.error('Export CSV error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
