// Startup step for the Income page. Runs before the server starts
// listening (see server.js). Everything is wrapped in try/catch by the
// caller: if any step fails we log it and let the server come up
// anyway, so an ops-time hiccup here never takes the CRM down.
//
// Two responsibilities:
//   1. Add tenders.won_at (idempotent) so existing databases catch up.
//   2. If the invoices table does not exist yet, apply the whole of
//      db/migrations/021-add-income.sql inside a transaction and
//      immediately seed the five invoices already raised, in the same
//      transaction so a partial seed can never survive a rollback.

const fs = require('fs');
const path = require('path');

const MIGRATION_PATH = path.join(__dirname, '..', 'db', 'migrations', '021-add-income.sql');

const NOT_LINKED_NOTE_SUFFIX = ' Tender link not set automatically. Link it from Edit.';

// Client + tender lookup rules for the seed. category / client_name /
// description / contract_label / amounts / dates / tide id / files /
// notes are stored verbatim.
//
// tenderStatus === 'any' skips the status filter; null means no tender
// link is expected and no fallback note is appended.
const SEED = [
  {
    invoice_number: 'INV-001',
    category: 'success_fee',
    clientPatterns: ['%TM Contract%'],
    tenderStatus: 'won',
    tenderTitlePattern: '%Concrete%Asphalt%',
    client_name: 'TM Contract Services Ltd',
    description: 'Bid writing success fee - 3% of bid value',
    contract_label: 'Construction of Concrete/Asphalt bases and associated works',
    net_amount: 4143.49,
    vat_amount: 0.00,
    issue_date: '2026-07-10',
    due_date: '2026-07-24',
    paid_date: '2026-07-17',
    amount_received: 4143.49,
    tide_transaction_id: 'RP46599851405921001020260717826200026',
    invoice_file: 'INV-001 10-07-2026 TM Contract Services.pdf',
    payment_evidence_file: 'INV-001 17-07-2026 TM Contract Services Payment.png',
    notes: 'Contact: Mark Hayden, invoices@tmcontract.co.uk. Not VAT registered - VAT nil.',
  },
  {
    invoice_number: 'INV-002',
    category: 'success_fee',
    clientPatterns: ['%TVS%', '%Total Vibration%'],
    tenderStatus: 'won',
    tenderTitlePattern: '%Sprung Floor%',
    client_name: 'Total Vibration Solutions Limited',
    description: 'Tender writing success fee',
    contract_label: 'Supply and installation of a Sports Hall Sprung Floor - 2026',
    net_amount: 1450.00,
    vat_amount: 0.00,
    issue_date: '2026-07-14',
    due_date: '2026-07-28',
    paid_date: '2026-08-03',
    amount_received: 1450.00,
    tide_transaction_id: '5000000018121341111020260803826309148',
    invoice_file: 'INV-002 14-07-2026 Total Vibration Solutions.pdf',
    payment_evidence_file: 'INV-002 03-08-2026 Total Vibration Solutions Payment.png',
    notes: 'Contact: Jason Lewis-Lamb, sales@tvs-group.co.uk. Not VAT registered - VAT nil. Received by bank transfer, payment reference TVS GROUP, no fees deducted. Paid 03/08/2026 against a 28/07/2026 due date - six days late. Issued via Tide carrying reference INV-001 in error, as Tide restarted its own numbering rather than continuing the company sequence. Logged here as INV-002 to preserve the sequence; distinguished from INV-001 (TM Contract Services Ltd, 10/07/2026, GBP 4,143.49) by client, date and amount. Paid in full and settled, so no credit note raised.',
  },
  {
    invoice_number: 'INV-003',
    category: 'success_fee',
    clientPatterns: ['%Total Clean%'],
    tenderStatus: 'won',
    tenderTitlePattern: '%Havebury%',
    client_name: 'Total Clean Franchise Limited',
    description: 'Tender writing success fee',
    contract_label: 'Southampton City Council cleaning services tender - SCC-SMS-0936',
    net_amount: 3500.00,
    vat_amount: 0.00,
    issue_date: '2026-09-16',
    due_date: '2026-09-30',
    paid_date: '2026-09-16',
    amount_received: 3500.00,
    tide_transaction_id: null,
    invoice_file: 'INV-003 16-09-2026 Total Clean Franchise.pdf',
    payment_evidence_file: 'INV-003 16-09-2026 Total Clean Franchise Payment.png',
    notes: 'Contact: accounts@totalclean.co.uk, no named contact on file. Not VAT registered, so VAT nil. REISSUED: the invoice first raised on 12 September 2026 was addressed to Total Clean Services Limited, the wrong legal entity. It was replaced on 16 September 2026 with this one, addressed to Total Clean Franchise Limited, before any payment was made against it. The reference INV-003 and the £3,500.00 value are unchanged; only the payee, issue date and due date moved. No credit note was raised because the first version was never paid and named a party that owed nothing; the superseded PDF is retained in Invoices Issued marked SUPERSEDED so the sequence explains itself. Received in full on 16 September 2026, same day as issue, appearing on the Tide statement as TOTA C F LTD SW, which confirms the corrected entity is the one that paid. Payment Link was not enabled, so no processing fee was taken and the full £3,500.00 landed. CRM link: attached to Total Clean\'s won tender in the CRM, while the Sales Log names the Southampton City Council tender (SCC-SMS-0936). Relink from Edit if needed.',
  },
  {
    invoice_number: 'INV-004',
    category: 'fixed_fee',
    clientPatterns: ['%HS Elite%', '%Fife Electric%'],
    tenderStatus: null,
    tenderTitlePattern: null,
    client_name: 'HS Elite Electricians - trading as Fife Electricians Ltd',
    description: 'Bid Support',
    contract_label: 'Ad hoc bid support - no single tender named on the invoice',
    net_amount: 200.00,
    vat_amount: 0.00,
    issue_date: '2026-09-17',
    due_date: '2026-10-01',
    paid_date: '2026-09-17',
    amount_received: 200.00,
    tide_transaction_id: null,
    invoice_file: 'INV-004 17-09-2026 HS Elite Electricians.pdf',
    payment_evidence_file: 'INV-004 17-09-2026 HS Elite Electricians Payment.png',
    notes: 'Contact: admin@fifeelectricians.co.uk, no named contact on file. Not VAT registered, so VAT nil. Raised and received the same day, 17 September 2026, well inside the 1 October due date. First piece of EVIA income that is not a success fee: billed as Bid Support at a flat £200.00 rather than payable on award, so it sits outside the no-win-no-fee model and is worth tracking separately if it becomes a recurring line. No single tender is named on the invoice. Client name is recorded exactly as it appears on the invoice; note that the wording reads as though HS Elite Electricians is the registered entity and Fife Electricians Ltd the trading name, which is the opposite of what the \'Ltd\' suffix suggests. Immaterial now the invoice is paid, but worth correcting in the Tide customer record before the next one. Payment Link was not enabled, so the full £200.00 landed.',
  },
  {
    invoice_number: 'INV-005',
    category: 'fixed_fee',
    clientPatterns: ['%Auction Estates%'],
    tenderStatus: 'any',
    tenderTitlePattern: '%Auction%',
    client_name: 'Auction Estates Limited',
    description: 'Bid writing services: Nottingham City Council, Property Auction Services, Lot 1 (Local and Regional Auctioneers), contract reference CPU 8465. Bid submitted 28/09/2026.',
    contract_label: 'Nottingham City Council, Property Auction Services, Lot 1, CPU 8465',
    net_amount: 1000.00,
    vat_amount: 0.00,
    issue_date: '2026-09-28',
    due_date: '2026-10-12',
    paid_date: null,
    amount_received: null,
    tide_transaction_id: null,
    invoice_file: 'INV-005 28-09-2026 Auction Estates.pdf',
    payment_evidence_file: null,
    notes: 'FAO Paul Giles, Director and Head Auctioneer, paul@auctionestates.co.uk. Not VAT registered, so VAT nil. Billed on submission as a fixed bid writing fee.',
  },
];

async function findExactlyOneClient(client, patterns) {
  const { rows } = await client.query(
    `SELECT id, company_name
     FROM clients
     WHERE company_name ILIKE ANY($1::text[])`,
    [patterns],
  );
  return rows.length === 1 ? rows[0] : null;
}

async function findExactlyOneTenderByClient(client, clientId, statusFilter) {
  const values = [clientId];
  let sql = `
    SELECT id, title, client_id
    FROM tenders
    WHERE client_id = $1
      AND dropped_at IS NULL
  `;
  if (statusFilter && statusFilter !== 'any') {
    values.push(statusFilter);
    sql += ` AND status = $${values.length}`;
  }
  const { rows } = await client.query(sql, values);
  return rows.length === 1 ? rows[0] : rows;
}

async function findExactlyOneTenderByTitle(client, titlePattern, statusFilter) {
  const values = [titlePattern];
  let sql = `
    SELECT id, title, client_id
    FROM tenders
    WHERE title ILIKE $1
      AND dropped_at IS NULL
  `;
  if (statusFilter && statusFilter !== 'any') {
    values.push(statusFilter);
    sql += ` AND status = $${values.length}`;
  }
  const { rows } = await client.query(sql, values);
  return rows.length === 1 ? rows[0] : rows;
}

async function seedOne(client, entry) {
  const clientRow = await findExactlyOneClient(client, entry.clientPatterns);
  const clientMatchCount = clientRow ? 1 : null;

  let tenderRow = null;
  let tenderMatchCount = 0;
  let tenderLinkExpected = entry.tenderStatus !== null;
  let tenderStage = 'not attempted';

  if (tenderLinkExpected) {
    if (clientRow) {
      const byClient = await findExactlyOneTenderByClient(client, clientRow.id, entry.tenderStatus);
      if (byClient && !Array.isArray(byClient)) {
        tenderRow = byClient;
        tenderMatchCount = 1;
        tenderStage = 'by client_id';
      } else {
        tenderMatchCount = Array.isArray(byClient) ? byClient.length : 0;
      }
    }
    if (!tenderRow && entry.tenderTitlePattern) {
      const byTitle = await findExactlyOneTenderByTitle(client, entry.tenderTitlePattern, entry.tenderStatus);
      if (byTitle && !Array.isArray(byTitle)) {
        tenderRow = byTitle;
        tenderMatchCount = 1;
        tenderStage = 'by title';
      } else if (tenderMatchCount === 0) {
        tenderMatchCount = Array.isArray(byTitle) ? byTitle.length : 0;
      }
    }
  }

  const clientIdForInsert = tenderRow ? tenderRow.client_id : (clientRow ? clientRow.id : null);
  let notesForInsert = entry.notes;
  if (tenderLinkExpected && !tenderRow) {
    notesForInsert = (notesForInsert || '') + NOT_LINKED_NOTE_SUFFIX;
  }

  await client.query(
    `INSERT INTO invoices (
      invoice_number, category, tender_id, client_id, client_name,
      description, contract_label,
      net_amount, vat_amount,
      issue_date, due_date, paid_date, amount_received,
      tide_transaction_id, invoice_file, payment_evidence_file, notes
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7,
      $8, $9,
      $10, $11, $12, $13,
      $14, $15, $16, $17
    )`,
    [
      entry.invoice_number,
      entry.category,
      tenderRow ? tenderRow.id : null,
      clientIdForInsert,
      entry.client_name,
      entry.description,
      entry.contract_label,
      entry.net_amount,
      entry.vat_amount,
      entry.issue_date,
      entry.due_date,
      entry.paid_date,
      entry.amount_received,
      entry.tide_transaction_id,
      entry.invoice_file,
      entry.payment_evidence_file,
      notesForInsert,
    ],
  );

  const tenderPart = tenderRow
    ? `linked to tender ${tenderRow.id} (${tenderRow.title})`
    : `no tender link (${tenderMatchCount} matches)`;
  const clientPart = clientIdForInsert != null
    ? `client ${clientIdForInsert}`
    : `client not linked (${clientMatchCount ?? 0} matches)`;
  console.log(`Income seed: ${entry.invoice_number} ${tenderPart}, ${clientPart} (${tenderStage})`);
}

async function ensureIncomeSchema(pool) {
  // Step 1: always try to add won_at. IF NOT EXISTS keeps it idempotent
  // and cheap when the column is already there.
  await pool.query(`ALTER TABLE tenders ADD COLUMN IF NOT EXISTS won_at DATE`);

  const { rows } = await pool.query(
    `SELECT to_regclass('public.invoices') AS relid`,
  );
  const exists = rows[0] && rows[0].relid !== null;
  if (exists) {
    return;
  }

  // Step 2: create the invoices table and seed inside one transaction.
  // Any error rolls the whole thing back so we never end up with a
  // half-seeded table.
  const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(migrationSql);
    for (const entry of SEED) {
      await seedOne(client, entry);
    }
    await client.query('COMMIT');
    console.log(`[income] Created invoices table and seeded ${SEED.length} invoice(s).`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[income] Failed to create / seed invoices table:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ensureIncomeSchema };
