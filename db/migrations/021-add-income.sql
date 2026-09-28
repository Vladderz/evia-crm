-- Migration 021: Income tracking (invoices) and tender win dates.
--
-- Adds a nullable won_at DATE to tenders so the Income page can order
-- the "To Invoice" queue chronologically from the moment a tender was
-- moved to Won (award_date is optional and often set later, so it is
-- not reliable). Introduces the invoices table that replaces the Sales
-- Log spreadsheet as the master record: each invoice is its own row,
-- optionally linked to a tender, and paid dates are stored exactly as
-- entered so the page can bucket income by month and measure how long
-- clients take to pay.
--
-- The server applies this file automatically on startup when the
-- invoices table does not yet exist (see lib/ensureIncomeSchema.js),
-- and seeds the five invoices already raised in the same transaction.
-- Running this file by hand on a database where the table exists is a
-- no-op thanks to IF NOT EXISTS guards.

ALTER TABLE tenders ADD COLUMN IF NOT EXISTS won_at DATE;

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number TEXT UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('success_fee', 'fixed_fee', 'retainer', 'other')),
  tender_id INTEGER REFERENCES tenders(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  description TEXT NOT NULL,
  contract_label TEXT,
  net_amount NUMERIC(12,2) NOT NULL CHECK (net_amount >= 0),
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  issue_date DATE NOT NULL,
  due_date DATE,
  paid_date DATE,
  amount_received NUMERIC(12,2),
  tide_transaction_id TEXT,
  invoice_file TEXT,
  payment_evidence_file TEXT,
  notes TEXT,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_tender_id_idx ON invoices (tender_id);
CREATE INDEX IF NOT EXISTS invoices_issue_date_idx ON invoices (issue_date);
CREATE INDEX IF NOT EXISTS invoices_paid_date_idx ON invoices (paid_date);

-- Reuse the generic update_updated_at_column() trigger function that
-- already sits alongside the clients and tenders triggers in schema.sql
-- so an update always refreshes updated_at without route code having
-- to remember.
DROP TRIGGER IF EXISTS set_invoices_updated_at ON invoices;
CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
