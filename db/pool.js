require('dotenv').config();

const pg = require('pg');
const { Pool } = pg;

// NUMERIC (OID 1700) arrives as a string by default in node-postgres. Parse to
// number so client-side reduce/sum doesn't silently string-concatenate. Safe:
// all NUMERIC values in this app (tender values, fees) sit well inside float64's
// exact integer range. Do NOT add a parser for INT8/BIGINT (OID 20) — those can
// lose precision on genuinely large ids.
pg.types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = pool;
