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
 * Shared invoice numbers                                            *
 *                                                                   *
 * Migration 022 removed the UNIQUE rule on invoice_number so several *
 * rows can share one number. The rules that keep this coherent are: *
 *   - SAME CLIENT: equal client_id when both rows have one; else    *
 *     equal client_name (trimmed, case-insensitive). Never partial. *
 *   - Non-void rows with the same number must be the same client.   *
 *     A conflict is a 409.                                          *
 *   - A number held only by void rows is not reusable. Numbers are  *
 *     never reused (409).                                           *
 *   - Same-client non-void rows are one invoice: shared fields must *
 *     match across every item.                                      *
 * ---------------------------------------------------------------- */

// Shared fields identical on every item of an invoice.
const SHARED_FIELDS = [
  'client_id',
  'client_name',
  'issue_date',
  'due_date',
  'paid_date',
  'tide_transaction_id',
  'invoice_file',
  'payment_evidence_file',
];

function isSameClient(a, b) {
  if (a.client_id != null && b.client_id != null) {
    return Number(a.client_id) === Number(b.client_id);
  }
  const na = ((a.client_name || '') + '').trim().toLowerCase();
  const nb = ((b.client_name || '') + '').trim().toLowerCase();
  if (!na || !nb) return false;
  return na === nb;
}

// Return YMD text regardless of whether the value comes back as a
// string (already text-cast by INVOICE_SELECT) or a JS Date (raw prev
// row from SELECT *).
function toYmd(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

// Classify a given invoice_number against the current invoices table.
//   targetClient must supply client_id / client_name for the row we're
//   about to write. excludeId, when supplied, ignores that row (used
//   during UPDATE so a row does not clash with itself).
async function classifyNumber(db, number, targetClient, excludeId) {
  const values = [number];
  let sql = `
    SELECT id, invoice_number, tender_id, client_id, client_name, voided_at,
           issue_date::text AS issue_date,
           due_date::text   AS due_date,
           paid_date::text  AS paid_date,
           tide_transaction_id, invoice_file, payment_evidence_file,
           net_amount, vat_amount, amount_received
    FROM invoices
    WHERE invoice_number = $1
  `;
  if (excludeId != null) {
    values.push(excludeId);
    sql += ` AND id <> $${values.length}`;
  }
  const { rows } = await db.query(sql, values);
  const nonVoid = rows.filter(r => r.voided_at == null);
  const voidRows = rows.filter(r => r.voided_at != null);
  if (nonVoid.length === 0 && voidRows.length === 0) {
    return { kind: 'unused' };
  }
  if (nonVoid.length === 0) {
    return { kind: 'voidOnly' };
  }
  const different = nonVoid.filter(r => !isSameClient(r, targetClient));
  if (different.length > 0) {
    return {
      kind: 'crossClient',
      otherClientName: different[0].client_name || 'another client',
    };
  }
  return {
    kind: 'joins',
    // Every non-void row shares fields, so any one is representative.
    invoice: nonVoid[0],
    siblings: nonVoid,
  };
}

function conflictMessage(kind, number, otherClientName) {
  if (kind === 'crossClient') {
    return `${number} is already used for ${otherClientName}.`;
  }
  if (kind === 'voidOnly') {
    return `${number} was voided. Numbers are never reused.`;
  }
  return `${number} is already used.`;
}

// Given a paid_date and (net, vat), return the amount_received to
// store. Preserves the existing rule: null unless paid; if the caller
// explicitly sent amount_received use that, otherwise recompute from
// the current net + vat total.
function receivedFor(paidDate, netAmount, vatAmount, providedReceived) {
  if (!paidDate) return null;
  if (providedReceived !== undefined) {
    if (providedReceived === '' || providedReceived == null) return null;
    return parseMoney(providedReceived);
  }
  return Math.round(
    ((parseMoney(netAmount) || 0) + (parseMoney(vatAmount) || 0)) * 100,
  ) / 100;
}

// Overwrite the shared fields on every sibling item so the invoice
// stays coherent. Each sibling's amount_received is recomputed from
// its own net + vat + the new paid_date so a paid_date flip carries
// the money field with it, matching the single-row path.
async function propagateSharedFields(db, invoiceNumber, sharedValues, excludeIds) {
  const idsToSkip = excludeIds && excludeIds.length > 0 ? excludeIds : [null];
  const { rows: siblings } = await db.query(
    `SELECT id, net_amount, vat_amount
     FROM invoices
     WHERE invoice_number = $1
       AND voided_at IS NULL
       AND id <> ALL($2::int[])`,
    [invoiceNumber, idsToSkip],
  );
  for (const sib of siblings) {
    const amountReceived = receivedFor(
      sharedValues.paid_date,
      sib.net_amount,
      sib.vat_amount,
      undefined,
    );
    await db.query(
      `UPDATE invoices SET
         client_id             = $1,
         client_name           = $2,
         issue_date            = $3,
         due_date              = $4,
         paid_date             = $5,
         tide_transaction_id   = $6,
         invoice_file          = $7,
         payment_evidence_file = $8,
         amount_received       = $9
       WHERE id = $10`,
      [
        sharedValues.client_id,
        sharedValues.client_name,
        sharedValues.issue_date,
        sharedValues.due_date,
        sharedValues.paid_date,
        sharedValues.tide_transaction_id,
        sharedValues.invoice_file,
        sharedValues.payment_evidence_file,
        amountReceived,
        sib.id,
      ],
    );
  }
  return siblings.length;
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
    // Void rows count towards the max on purpose: numbers are never
    // reused, so a voided INV-042 still means the next number is
    // INV-043. Items sharing a number (see migration 022) collapse
    // naturally here because we track the max integer, not the row
    // count.
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
 * POST /api/invoices                                                *
 * ---------------------------------------------------------------- */

router.post('/', async (req, res) => {
  const b = req.body || {};
  const db = await pool.connect();
  try {
    const invoice_number = trimOrNull(b.invoice_number);
    const category = b.category;
    const tender_id = b.tender_id === '' || b.tender_id == null ? null : parseInt(b.tender_id, 10);
    let client_id = b.client_id === '' || b.client_id == null ? null : parseInt(b.client_id, 10);

    // When a client is picked, derive client_name from that client's
    // company_name and ignore any client_name in the body. Otherwise
    // fall back to the client_name sent by the form.
    let client_name;
    if (client_id != null) {
      const { rows } = await db.query(
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
    let issue_date = trimOrNull(b.issue_date);
    let due_date = trimOrNull(b.due_date);
    if (!due_date && issue_date && isValidYmd(issue_date)) {
      due_date = addDaysYmd(issue_date, 14);
    }
    let paid_date = trimOrNull(b.paid_date);
    let tide_transaction_id = trimOrNull(b.tide_transaction_id);
    let invoice_file = trimOrNull(b.invoice_file);
    let payment_evidence_file = trimOrNull(b.payment_evidence_file);
    const notes = trimOrNull(b.notes);

    let amount_received;
    if ('amount_received' in b) {
      amount_received = receivedFor(paid_date, net_amount, vat_amount, b.amount_received);
    } else {
      amount_received = receivedFor(paid_date, net_amount, vat_amount, undefined);
    }

    const resolved = {
      invoice_number, category, tender_id, client_id, client_name, description,
      contract_label, net_amount, vat_amount, issue_date, due_date, paid_date,
      amount_received, tide_transaction_id, invoice_file, payment_evidence_file, notes,
    };

    const validationError = validateResolved(resolved, { requireIssue: true });
    if (validationError) return res.status(400).json({ error: validationError });

    const refsError = await assertRefsExist(resolved);
    if (refsError) return res.status(400).json({ error: refsError });

    await db.query('BEGIN');

    // Classify the number against existing rows and, when it joins an
    // existing invoice, take that invoice's shared fields so this new
    // row lines up with the rest.
    let joinedInvoiceNumber = null;
    if (invoice_number) {
      const c = await classifyNumber(db, invoice_number, { client_id, client_name });
      if (c.kind === 'crossClient' || c.kind === 'voidOnly') {
        await db.query('ROLLBACK');
        return res.status(409).json({ error: conflictMessage(c.kind, invoice_number, c.otherClientName) });
      }
      if (c.kind === 'joins') {
        client_id = c.invoice.client_id;
        client_name = c.invoice.client_name;
        issue_date = toYmd(c.invoice.issue_date);
        due_date = toYmd(c.invoice.due_date);
        paid_date = toYmd(c.invoice.paid_date);
        tide_transaction_id = c.invoice.tide_transaction_id;
        invoice_file = c.invoice.invoice_file;
        payment_evidence_file = c.invoice.payment_evidence_file;
        amount_received = receivedFor(paid_date, net_amount, vat_amount, undefined);
        joinedInvoiceNumber = invoice_number;
      }
    }

    const { rows } = await db.query(
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

    await db.query('COMMIT');
    // joinedInvoiceNumber is retained for future audit but no
    // propagation is needed: joining adopts the invoice's fields,
    // it does not change them.
    void joinedInvoiceNumber;

    const saved = await fetchInvoiceById(rows[0].id);
    res.status(201).json(saved);
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch { /* no-op */ }
    if (err && err.code === '23505') {
      return res.status(409).json({ error: `${req.body?.invoice_number || 'This number'} is already used` });
    }
    console.error('Create invoice error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    db.release();
  }
});

/* ---------------------------------------------------------------- *
 * PUT /api/invoices/:id                                             *
 * ---------------------------------------------------------------- */

router.put('/:id', async (req, res) => {
  const db = await pool.connect();
  try {
    const idNum = parseInt(req.params.id, 10);
    const current = await db.query('SELECT * FROM invoices WHERE id = $1', [idNum]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const prev = current.rows[0];
    const b = req.body || {};

    // Merge: if key present in body, use it (empty string -> null,
    // except for the required string fields); otherwise keep prev.
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

    let invoice_number = 'invoice_number' in b ? pickText('invoice_number', prev.invoice_number) : prev.invoice_number;
    const category = 'category' in b ? b.category : prev.category;
    const tender_id = pickInt('tender_id', prev.tender_id);
    let client_id = pickInt('client_id', prev.client_id);

    // Only sync client_name from the clients table when the picked
    // client actually changes to a real client. This protects the
    // legal names stored on the seeded invoices from being flattened
    // to the shorter Client Book display name during unrelated edits.
    // When the picker is cleared to "No client", the drawer sends
    // client_name; use that so the on-invoice name can be corrected.
    let client_name = prev.client_name;
    if ('client_id' in b && client_id !== prev.client_id && client_id != null) {
      const { rows } = await db.query(
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
    let issue_date = 'issue_date' in b ? pickText('issue_date', prev.issue_date) : toYmd(prev.issue_date);

    let due_date;
    if ('due_date' in b) {
      due_date = pickText('due_date', prev.due_date);
      if (!due_date && issue_date && isValidYmd(issue_date)) {
        due_date = addDaysYmd(issue_date, 14);
      }
    } else {
      due_date = toYmd(prev.due_date);
    }

    const prevPaid = toYmd(prev.paid_date);
    let paid_date = 'paid_date' in b ? pickText('paid_date', prevPaid) : prevPaid;

    let amount_received;
    if ('amount_received' in b) {
      amount_received = receivedFor(paid_date, net_amount, vat_amount, b.amount_received);
    } else {
      amount_received = receivedFor(paid_date, net_amount, vat_amount, undefined);
    }

    let tide_transaction_id = pickText('tide_transaction_id', prev.tide_transaction_id);
    let invoice_file = pickText('invoice_file', prev.invoice_file);
    let payment_evidence_file = pickText('payment_evidence_file', prev.payment_evidence_file);
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

    await db.query('BEGIN');

    // Decide the shape of this save:
    //   propagate: the row keeps its non-empty number and already
    //     belonged to that invoice. Its new shared fields become the
    //     invoice's, applied to every sibling in the same transaction.
    //   join: the number matches a same-client non-void invoice this
    //     row does not yet belong to (either the number is new or the
    //     row was a solo invoice). The row adopts that invoice's
    //     shared fields.
    //   solo: the number is unused (or empty). The row is its own
    //     invoice; the old invoice, if any, is left untouched.
    // 409 cases (cross-client, void-only) short-circuit before write.
    let mode = 'solo';
    let sharedForPropagate = null;
    let joinSource = null;

    if (invoice_number) {
      const c = await classifyNumber(db, invoice_number, { client_id, client_name }, idNum);
      // The "number was voided" 409 only fires when the item is taking
      // a number it did not already have. An item that keeps its own
      // non-empty number is not reusing a void number: it always was
      // that number and only its siblings happen to be void. Let it
      // save as a solo item.
      const keepingOwnNumber = prev.invoice_number === invoice_number;
      if (c.kind === 'crossClient' || (c.kind === 'voidOnly' && !keepingOwnNumber)) {
        await db.query('ROLLBACK');
        return res.status(409).json({ error: conflictMessage(c.kind, invoice_number, c.otherClientName) });
      }
      const wasVoid = prev.voided_at != null;
      const belongedToJoin =
        c.kind === 'joins'
        && !wasVoid
        && prev.invoice_number === invoice_number
        && isSameClient(prev, { client_id, client_name });
      if (belongedToJoin) {
        mode = 'propagate';
        sharedForPropagate = {
          client_id, client_name,
          issue_date, due_date, paid_date,
          tide_transaction_id, invoice_file, payment_evidence_file,
        };
      } else if (c.kind === 'joins') {
        mode = 'join';
        joinSource = c.invoice;
      }
    }

    if (mode === 'join') {
      // Adopt the joined invoice's shared fields, ignoring anything
      // sent that would drift from them.
      client_id = joinSource.client_id;
      client_name = joinSource.client_name;
      issue_date = toYmd(joinSource.issue_date);
      due_date = toYmd(joinSource.due_date);
      paid_date = toYmd(joinSource.paid_date);
      tide_transaction_id = joinSource.tide_transaction_id;
      invoice_file = joinSource.invoice_file;
      payment_evidence_file = joinSource.payment_evidence_file;
      amount_received = receivedFor(paid_date, net_amount, vat_amount, undefined);
    }

    await db.query(
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

    if (mode === 'propagate') {
      await propagateSharedFields(db, invoice_number, sharedForPropagate, [idNum]);
    }

    await db.query('COMMIT');

    const saved = await fetchInvoiceById(idNum);
    res.json(saved);
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch { /* no-op */ }
    if (err && err.code === '23505') {
      return res.status(409).json({ error: `${req.body?.invoice_number || 'This number'} is already used` });
    }
    console.error('Update invoice error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    db.release();
  }
});

/* ---------------------------------------------------------------- *
 * POST /api/invoices/:id/void                                       *
 * ---------------------------------------------------------------- */

router.post('/:id/void', async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) return res.status(400).json({ error: 'Reason is required' });
  const scope = req.body?.scope === 'invoice' ? 'invoice' : 'item';
  const db = await pool.connect();
  try {
    const idNum = parseInt(req.params.id, 10);
    const current = await db.query(
      'SELECT id, invoice_number, client_id, client_name, voided_at FROM invoices WHERE id = $1',
      [idNum],
    );
    if (!current.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const row = current.rows[0];

    await db.query('BEGIN');
    if (scope === 'invoice' && row.invoice_number) {
      // Void every non-void item of this invoice at the same instant
      // with the same reason. same-client scoping so a shared number
      // across a hypothetical inconsistent state never voids
      // strangers.
      const { rows: siblings } = await db.query(
        `SELECT id, client_id, client_name
         FROM invoices
         WHERE invoice_number = $1 AND voided_at IS NULL`,
        [row.invoice_number],
      );
      const targets = siblings
        .filter(s => isSameClient(s, row))
        .map(s => s.id);
      // Belt-and-braces: ensure the driving row is in the set even if
      // classifyNumber's client rule quietly disagreed.
      if (!targets.includes(idNum)) targets.push(idNum);
      await db.query(
        `UPDATE invoices SET voided_at = now(), void_reason = $1
         WHERE id = ANY($2::int[])`,
        [reason, targets],
      );
    } else {
      await db.query(
        `UPDATE invoices SET voided_at = now(), void_reason = $1 WHERE id = $2`,
        [reason, idNum],
      );
    }
    await db.query('COMMIT');

    const saved = await fetchInvoiceById(idNum);
    res.json(saved);
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch { /* no-op */ }
    console.error('Void invoice error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    db.release();
  }
});

/* ---------------------------------------------------------------- *
 * POST /api/invoices/:id/restore                                    *
 * ---------------------------------------------------------------- */

router.post('/:id/restore', async (req, res) => {
  const scope = req.body?.scope === 'invoice' ? 'invoice' : 'item';
  const db = await pool.connect();
  try {
    const idNum = parseInt(req.params.id, 10);
    const current = await db.query(
      'SELECT id, invoice_number, client_id, client_name, voided_at FROM invoices WHERE id = $1',
      [idNum],
    );
    if (!current.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const row = current.rows[0];

    await db.query('BEGIN');

    // Work out the set of ids to restore up front. Group scope pulls
    // every void row with the same number and client whose voided_at
    // matches this row's (that is, voided in the same batch).
    let targetIds = [idNum];
    if (scope === 'invoice' && row.invoice_number && row.voided_at) {
      const { rows: siblings } = await db.query(
        `SELECT id, client_id, client_name
         FROM invoices
         WHERE invoice_number = $1
           AND voided_at = $2`,
        [row.invoice_number, row.voided_at],
      );
      targetIds = siblings
        .filter(s => isSameClient(s, row))
        .map(s => s.id);
      if (!targetIds.includes(idNum)) targetIds.push(idNum);
    }

    // Apply the join rule: if another client now uses this number,
    // refuse with 409. Otherwise adopt the live invoice's shared
    // fields when it exists.
    if (row.invoice_number) {
      const c = await classifyNumber(db, row.invoice_number, row, idNum);
      if (c.kind === 'crossClient') {
        await db.query('ROLLBACK');
        return res.status(409).json({ error: conflictMessage(c.kind, row.invoice_number, c.otherClientName) });
      }
      if (c.kind === 'joins') {
        // Adopt the invoice's shared fields on every restored row.
        const s = c.invoice;
        for (const tid of targetIds) {
          const { rows: tRows } = await db.query(
            'SELECT net_amount, vat_amount FROM invoices WHERE id = $1',
            [tid],
          );
          const tRow = tRows[0];
          const paid = toYmd(s.paid_date);
          const amt = receivedFor(paid, tRow.net_amount, tRow.vat_amount, undefined);
          await db.query(
            `UPDATE invoices SET
               voided_at             = NULL,
               void_reason           = NULL,
               client_id             = $1,
               client_name           = $2,
               issue_date            = $3,
               due_date              = $4,
               paid_date             = $5,
               tide_transaction_id   = $6,
               invoice_file          = $7,
               payment_evidence_file = $8,
               amount_received       = $9
             WHERE id = $10`,
            [
              s.client_id, s.client_name,
              toYmd(s.issue_date), toYmd(s.due_date), paid,
              s.tide_transaction_id, s.invoice_file, s.payment_evidence_file,
              amt, tid,
            ],
          );
        }
      } else {
        // No live invoice with that number: plain restore.
        await db.query(
          `UPDATE invoices SET voided_at = NULL, void_reason = NULL
           WHERE id = ANY($1::int[])`,
          [targetIds],
        );
      }
    } else {
      await db.query(
        `UPDATE invoices SET voided_at = NULL, void_reason = NULL
         WHERE id = ANY($1::int[])`,
        [targetIds],
      );
    }

    await db.query('COMMIT');

    const saved = await fetchInvoiceById(idNum);
    res.json(saved);
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch { /* no-op */ }
    console.error('Restore invoice error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    db.release();
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

// Same-client key used to group rows into invoices. Numeric client_id
// takes priority; otherwise the trimmed lower-cased client_name. Rows
// with no number stand alone (each row is its own invoice).
function groupKeyOf(row, ordinal) {
  const number = (row.invoice_number || '').trim();
  if (!number) return `__solo__:${ordinal}`;
  const clientPart = row.client_id != null
    ? `id:${row.client_id}`
    : `name:${((row.client_name || '') + '').trim().toLowerCase()}`;
  if (row.state === 'void') {
    // Void items grouped by number + voided_at so a hypothetical
    // second void batch of the same number stays separate.
    return `void:${number}:${clientPart}:${row.voided_at}`;
  }
  return `live:${number}:${clientPart}`;
}

function joinDistinct(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    if (v == null || v === '') continue;
    const s = String(v);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.join('; ');
}

router.get('/export.csv', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${INVOICE_SELECT}
       FROM invoices i
       LEFT JOIN tenders t ON i.tender_id = t.id
       ORDER BY i.issue_date ASC, i.invoice_number ASC, i.id ASC`,
    );

    // Group items by shared invoice, preserving the order the first
    // item of each group appeared in. One CSV row per invoice, matching
    // the Sales Log's one-row-per-invoice rule.
    const groups = new Map();
    let solo = 0;
    for (const r of rows) {
      const key = groupKeyOf(r, solo++);
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          items: [],
          first: r,
        };
        groups.set(key, g);
      }
      g.items.push(r);
    }

    let cumulative = 0;
    const csvRows = [];
    for (const g of groups.values()) {
      const first = g.first;
      const isVoid = first.state === 'void';
      const net = g.items.reduce((s, r) => s + (parseFloat(r.net_amount) || 0), 0);
      const vat = g.items.reduce((s, r) => s + (parseFloat(r.vat_amount) || 0), 0);
      const total = Math.round((net + vat) * 100) / 100;
      const hasReceived = g.items.some(r => r.amount_received != null);
      const received = hasReceived
        ? Math.round(g.items.reduce((s, r) => s + (parseFloat(r.amount_received) || 0), 0) * 100) / 100
        : null;
      // Status is derived from the shared paid_date and issue rules,
      // not per item. Cross-item status disagreements can't happen
      // under the shared-fields rule; if they somehow do, treat the
      // group as awaiting.
      let statusLabel;
      if (isVoid) statusLabel = 'Void';
      else if (first.state === 'paid') statusLabel = 'Paid';
      else if (first.state === 'overdue') statusLabel = 'OVERDUE';
      else statusLabel = 'Outstanding';

      if (!isVoid && Number.isFinite(net)) cumulative += net;
      const cumulativeCell = isVoid ? '' : money2(cumulative);

      const description = joinDistinct(g.items.map(r => r.description));
      const tenderOrContract = joinDistinct(
        g.items.map(r => r.contract_label || r.tender_title || ''),
      );
      const notes = joinDistinct(g.items.map(r => r.notes));

      const difference = first.paid_date && received != null
        ? Math.round((received - total) * 100) / 100
        : null;

      csvRows.push([
        first.invoice_number || '',
        ymdToDMY(first.issue_date),
        first.client_name || '',
        description,
        money2(net),
        money2(vat),
        money2(total),
        ymdToDMY(first.due_date),
        ymdToDMY(first.paid_date),
        received == null ? '' : money2(received),
        difference == null ? '' : money2(difference),
        statusLabel,
        first.tide_transaction_id || '',
        first.invoice_file || '',
        first.payment_evidence_file || '',
        cumulativeCell,
        notes,
        tenderOrContract,
      ]);
    }

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
