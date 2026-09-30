-- Migration 022: allow several invoice records to share one invoice_number.
--
-- The Sales Log holds one row per real invoice, but a single invoice
-- often bills more than one item (Leaves INV-007 covers six DPS items).
-- Marking each item Invoice Sent creates a row of its own with the
-- next number in sequence, so the CRM ends up with several invoices
-- instead of one. To keep item history intact, this migration lets
-- several invoice rows share the same invoice_number: it drops the
-- UNIQUE rule that migration 021 put on invoices.invoice_number and
-- replaces it with a plain btree index so lookups by number stay fast.
--
-- The live drop is applied by lib/ensureSharedInvoiceNumbers.js at
-- startup, which reads pg_constraint and pg_index for the actual name
-- Postgres generated (invoices_invoice_number_key by default, but not
-- guaranteed). This file records the intent and can be run by hand on
-- a fresh database.

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
DROP INDEX IF EXISTS invoices_invoice_number_key;
CREATE INDEX IF NOT EXISTS invoices_invoice_number_idx ON invoices (invoice_number);
