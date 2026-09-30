// One-off startup step: merge the six Leaves September DPS records
// into one invoice, INV-007.
//
// Background: Evia sent Leaves one real invoice on 30/09/2026 covering
// six DPS items (four at £250 and two at £350, £1,700.00 in total, no
// VAT), but the CRM's Mark Invoice Sent flow created a separate
// invoice with the next number for each item. Migration 022 lets
// several invoice rows share one number, so those six records can now
// be merged back into INV-007 without losing per-item history.
//
// The step is heavily guarded and logs every branch. It only runs
// once ensureSharedInvoiceNumbers reports the unique rule is gone
// (see server.js). Once you have confirmed the merge in the CRM this
// file can be deleted; delete the require+call in server.js too.
//
// Every log line starts "Leaves INV-007:" so the merge is easy to
// grep for in Railway logs.

const INV_NUMBER = 'INV-007';
const EXPECTED_ITEM_COUNT = 6;
const EXPECTED_NET_MULTISET = [250, 250, 250, 250, 350, 350];
const EXPECTED_VAT_TOTAL = 0;
const EXPECTED_NET_TOTAL = 1700;
const NEW_ISSUE_DATE = '2026-09-30';
const NEW_DUE_DATE = '2026-10-14';
const NEW_CATEGORY = 'fixed_fee';

function log(msg) {
  console.log(`Leaves INV-007: ${msg}`);
}

function toNum(v) {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

async function fetchLeavesClientIds(db) {
  const { rows } = await db.query(
    `SELECT id, company_name FROM clients WHERE company_name ILIKE '%leaves%'`,
  );
  return rows;
}

async function fetchCandidates(db, leavesClientIds) {
  // "Belongs to Leaves" per 4b: item's client_id or its tender's
  // client_id is a Leaves client, or the item has no client_id and its
  // client_name contains "leaves" (case-insensitive).
  const idArr = leavesClientIds.map(c => c.id);
  const { rows } = await db.query(
    `SELECT
       i.id, i.invoice_number, i.category, i.client_id, i.client_name,
       i.tender_id, i.description,
       i.net_amount, i.vat_amount, i.paid_date, i.voided_at,
       i.issue_date::text AS issue_date,
       t.title  AS tender_title,
       t.client_id AS tender_client_id
     FROM invoices i
     LEFT JOIN tenders t ON i.tender_id = t.id
     WHERE i.voided_at IS NULL
       AND i.paid_date IS NULL
       AND i.issue_date >= '2026-09-01'
       AND i.issue_date <  '2026-10-01'
       AND (
         i.client_id = ANY($1::int[])
         OR t.client_id = ANY($1::int[])
         OR (i.client_id IS NULL AND i.client_name ILIKE '%leaves%')
       )`,
    [idArr],
  );
  return rows;
}

async function fetchOtherClientInv007(db, leavesClientIds) {
  const idArr = leavesClientIds.map(c => c.id);
  const { rows } = await db.query(
    `SELECT i.id, i.client_id, i.client_name
     FROM invoices i
     WHERE i.invoice_number = $1
       AND i.voided_at IS NULL
       AND NOT (
         i.client_id = ANY($2::int[])
         OR (i.client_id IS NULL AND i.client_name ILIKE '%leaves%')
       )`,
    [INV_NUMBER, idArr],
  );
  return rows;
}

async function fetchNextNumber(db) {
  const { rows } = await db.query(
    `SELECT invoice_number FROM invoices WHERE invoice_number ~ '^INV-[0-9]+$'`,
  );
  let maxN = 0;
  for (const r of rows) {
    const m = /^INV-(\d+)$/.exec(r.invoice_number);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  return `INV-${String(maxN + 1).padStart(3, '0')}`;
}

function candidateDescription(c) {
  return c.tender_title || c.description || '(no description)';
}

function isSameMultiset(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

async function fixLeavesInv007(pool) {
  const db = await pool.connect();
  try {
    const leavesClients = await fetchLeavesClientIds(db);
    if (leavesClients.length === 0) {
      log('no clients matching "leaves"; nothing to do');
      return;
    }

    // 4a. Already merged?
    const { rows: existing } = await db.query(
      `SELECT i.id, i.client_id, i.client_name
       FROM invoices i
       WHERE i.invoice_number = $1 AND i.voided_at IS NULL`,
      [INV_NUMBER],
    );
    const leavesIdSet = new Set(leavesClients.map(c => c.id));
    const belongsToLeaves = (row) =>
      (row.client_id != null && leavesIdSet.has(row.client_id))
      || (row.client_id == null && ((row.client_name || '').toLowerCase().includes('leaves')));
    const existingLeaves = existing.filter(belongsToLeaves);
    if (existingLeaves.length === EXPECTED_ITEM_COUNT
        && existing.length === EXPECTED_ITEM_COUNT) {
      log('already merged');
      return;
    }

    // 4b. Find candidates.
    const candidates = await fetchCandidates(db, leavesClients);

    // 4c. Guard checks. Log every candidate up front so the report is
    //     always useful whether we proceed or not.
    const candidateSummary = candidates
      .map(c => `id=${c.id} number=${c.invoice_number ?? '-'} amount=${toNum(c.net_amount)} client_id=${c.client_id ?? '-'} tender=${candidateDescription(c)} issue=${c.issue_date}`)
      .join('\n  ');
    log(`candidates (${candidates.length}):\n  ${candidateSummary || '(none)'}`);

    const failures = [];
    if (candidates.length !== EXPECTED_ITEM_COUNT) {
      failures.push(`expected ${EXPECTED_ITEM_COUNT} candidates, saw ${candidates.length}`);
    }
    const nets = candidates.map(c => toNum(c.net_amount));
    if (!isSameMultiset(nets, EXPECTED_NET_MULTISET)) {
      failures.push(`net amounts do not match [${EXPECTED_NET_MULTISET.join(',')}]; saw [${nets.join(',')}]`);
    }
    const netTotal = nets.reduce((s, n) => s + n, 0);
    if (Math.round(netTotal * 100) / 100 !== EXPECTED_NET_TOTAL) {
      failures.push(`net total ${netTotal} != ${EXPECTED_NET_TOTAL}`);
    }
    const vatTotal = candidates.reduce((s, c) => s + toNum(c.vat_amount), 0);
    if (Math.round(vatTotal * 100) / 100 !== EXPECTED_VAT_TOTAL) {
      failures.push(`VAT total ${vatTotal} != ${EXPECTED_VAT_TOTAL}`);
    }
    // Resolve each candidate to a client_id: its own if set, otherwise
    // its tender's.
    const resolvedClientIds = candidates.map(c => c.client_id ?? c.tender_client_id ?? null);
    const distinct = Array.from(new Set(resolvedClientIds.filter(id => id != null)));
    if (distinct.length !== 1) {
      failures.push(`candidates resolve to ${distinct.length} client ids (${distinct.join(',')})`);
    }
    const sharedClientId = distinct[0] ?? null;
    if (sharedClientId != null && !leavesIdSet.has(sharedClientId)) {
      failures.push(`resolved client_id ${sharedClientId} is not a Leaves clients row`);
    }
    // 4c last check: no other client already uses INV-007.
    const otherClientInv007 = await fetchOtherClientInv007(db, leavesClients);
    if (otherClientInv007.length > 0) {
      failures.push(`INV-007 is already used by non-Leaves client(s): ${otherClientInv007.map(r => r.client_name || r.client_id).join(', ')}`);
    }

    if (failures.length > 0) {
      for (const f of failures) log(`skipped: ${f}`);
      log('no changes made');
      return;
    }

    // 4d. In one transaction, set the six shared fields on all six.
    await db.query('BEGIN');
    for (const c of candidates) {
      await db.query(
        `UPDATE invoices SET
           invoice_number = $1,
           issue_date     = $2,
           due_date       = $3,
           category       = $4,
           client_id      = $5
         WHERE id = $6`,
        [INV_NUMBER, NEW_ISSUE_DATE, NEW_DUE_DATE, NEW_CATEGORY, sharedClientId, c.id],
      );
    }
    await db.query('COMMIT');

    // 4e. Report the merge and check next-number.
    for (const c of candidates) {
      log(`merged id=${c.id} from ${c.invoice_number ?? '(no number)'} -> ${INV_NUMBER} (${candidateDescription(c)})`);
    }
    const next = await fetchNextNumber(db);
    log(`next-number now ${next}`);
    if (next !== 'INV-008') {
      const { rows: higher } = await db.query(
        `SELECT id, invoice_number, voided_at, client_name
         FROM invoices
         WHERE invoice_number ~ '^INV-[0-9]+$'
           AND CAST(SUBSTRING(invoice_number FROM 5) AS INTEGER) > 7
         ORDER BY invoice_number`,
      );
      for (const h of higher) {
        log(`above INV-007: id=${h.id} number=${h.invoice_number} client="${h.client_name}" voided=${h.voided_at ? 'yes' : 'no'}`);
      }
    }
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch { /* no-op */ }
    log(`failed: ${err.message}`);
    throw err;
  } finally {
    db.release();
  }
}

module.exports = { fixLeavesInv007 };
