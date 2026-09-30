// Startup step for shared invoice numbers. Runs after ensureIncomeSchema
// in server.js's runStartupSetup(), wrapped in try/catch so a failure
// logs and never keeps the server from listening.
//
// Migration 021 put a UNIQUE rule on invoices.invoice_number. Migration
// 022 removes it so several invoice rows can share one number (all rows
// with the same trimmed non-empty number and the same client are one
// real invoice; each row is an item on it). The unique constraint
// Postgres generates carries a default name, but we don't rely on that:
// we read pg_constraint and pg_index for whichever names are actually
// there and drop each one individually. Every statement is its own
// pool.query() call, never chained into a multi-statement string, so a
// failure in one step is clean.
//
// The step is idempotent: on a database that has already been migrated
// it drops nothing, ensures the plain index exists and logs one line.

async function ensureSharedInvoiceNumbers(pool) {
  const dropped = [];

  // 1. UNIQUE constraints touching only invoices.invoice_number.
  //    contype = 'u' is a UNIQUE constraint; conkey holds the attnum
  //    list. array_length filters to single-column constraints so a
  //    hypothetical (invoice_number, client_id) unique rule isn't
  //    caught here.
  const { rows: uniqueConstraints } = await pool.query(`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE t.relname = 'invoices'
      AND c.contype = 'u'
      AND a.attname = 'invoice_number'
      AND array_length(c.conkey, 1) = 1
  `);
  for (const r of uniqueConstraints) {
    await pool.query(`ALTER TABLE invoices DROP CONSTRAINT "${r.conname}"`);
    dropped.push(`constraint ${r.conname}`);
  }

  // 2. UNIQUE indexes not backed by a constraint. A UNIQUE constraint
  //    normally owns its index and dropping the constraint drops the
  //    index, but a hand-rolled CREATE UNIQUE INDEX would not.
  //    pg_index.indkey is an int2vector; array_length(...::int[], 1)
  //    counts columns, so this filters to single-column indexes.
  const { rows: uniqueIndexes } = await pool.query(`
    SELECT ic.relname AS index_name
    FROM pg_index x
    JOIN pg_class t  ON t.oid = x.indrelid
    JOIN pg_class ic ON ic.oid = x.indexrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(x.indkey)
    WHERE t.relname = 'invoices'
      AND x.indisunique
      AND a.attname = 'invoice_number'
      AND array_length(x.indkey::int[], 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c WHERE c.conindid = ic.oid
      )
  `);
  for (const r of uniqueIndexes) {
    await pool.query(`DROP INDEX "${r.index_name}"`);
    dropped.push(`index ${r.index_name}`);
  }

  // 3. Ensure the replacement plain btree index.
  await pool.query(
    'CREATE INDEX IF NOT EXISTS invoices_invoice_number_idx ON invoices (invoice_number)',
  );

  if (dropped.length === 0) {
    console.log('Shared invoice numbers: already done');
  } else {
    console.log(`Shared invoice numbers: dropped ${dropped.join(', ')}`);
  }

  return { uniqueRuleGone: true };
}

module.exports = { ensureSharedInvoiceNumbers };
