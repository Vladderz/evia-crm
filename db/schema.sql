-- Evia CRM Schema
-- Run this against your Railway PostgreSQL database

-- Users table (for app login)
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id           SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email        TEXT,
  phone        TEXT,
  website      TEXT,
  sector       TEXT,
  region       TEXT,
  status       TEXT CHECK (status IN ('active_client', 'seeking_tender', 'nurturing', 'cold')) DEFAULT 'nurturing',
  notes        TEXT,
  account_manager VARCHAR(20) DEFAULT 'vlad',
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Tenders table
CREATE TABLE IF NOT EXISTS tenders (
  id                  SERIAL PRIMARY KEY,
  client_id           INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  buyer               TEXT,
  estimated_value     NUMERIC,
  submission_deadline TIMESTAMPTZ,
  portal              TEXT,
  reference_number    TEXT,
  sector              TEXT,
  tender_url          TEXT,
  status              TEXT CHECK (status IN (
    'questionnaire_sent', 'writing', 'submitted', 'won', 'lost', 'archived'
  )) DEFAULT 'questionnaire_sent',
  outreach_status     TEXT CHECK (outreach_status IN (
    'not_started', 'emails_sent', 'replies_received', 'client_onboarded'
  )) DEFAULT 'not_started',
  prospects_contacted TEXT,
  evia_fee            NUMERIC,
  assigned_to         TEXT,
  notes               TEXT,
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Activity log table
CREATE TABLE IF NOT EXISTS activity_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Prospected contracts table
CREATE TABLE IF NOT EXISTS prospected_contracts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  url TEXT NOT NULL UNIQUE,
  submission_deadline DATE NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  ocds_id VARCHAR(100),
  added_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Extractions cache table (for AI tender URL extractions)
CREATE TABLE IF NOT EXISTS extractions (
  id             SERIAL PRIMARY KEY,
  url            TEXT UNIQUE NOT NULL,
  extracted_data JSONB,
  extracted_at   TIMESTAMPTZ DEFAULT now()
);

-- Trigger function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for clients
DROP TRIGGER IF EXISTS set_clients_updated_at ON clients;
CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Triggers for tenders
DROP TRIGGER IF EXISTS set_tenders_updated_at ON tenders;
CREATE TRIGGER set_tenders_updated_at
  BEFORE UPDATE ON tenders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenders_submission_deadline ON tenders(submission_deadline);
CREATE INDEX IF NOT EXISTS idx_tenders_reference_number ON tenders(reference_number);
CREATE INDEX IF NOT EXISTS idx_extractions_url ON extractions(url);
