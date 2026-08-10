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
  status       TEXT CHECK (status IN ('active_client', 'seeking_tender', 'prospect')) DEFAULT 'prospect',
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
  award_date          DATE,
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

-- Sales Pipeline table
CREATE TABLE IF NOT EXISTS sales_pipeline (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(100),
  website VARCHAR(500),
  sector VARCHAR(255),
  region VARCHAR(255),
  tender_title VARCHAR(500),
  tender_url VARCHAR(1000),
  tender_reference VARCHAR(255),
  tender_value NUMERIC,
  submission_deadline DATE,
  award_date DATE,
  buyer VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'contacted',
  last_contact_date DATE DEFAULT CURRENT_DATE,
  next_followup_date DATE,
  assigned_to VARCHAR(50),
  created_by INTEGER REFERENCES users(id),
  prospected_contract_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT sales_pipeline_status_check CHECK (status IN ('contacted', 'call_booked', 'waiting_room'))
);

-- Pipeline notes table
CREATE TABLE IF NOT EXISTS pipeline_notes (
  id SERIAL PRIMARY KEY,
  pipeline_id INTEGER NOT NULL REFERENCES sales_pipeline(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT pipeline_notes_type_check CHECK (note_type IN ('manual', 'system'))
);

-- Tender notes table
CREATE TABLE IF NOT EXISTS tender_notes (
  id SERIAL PRIMARY KEY,
  tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT tender_notes_type_check CHECK (note_type IN ('manual', 'system'))
);

-- Client notes table
CREATE TABLE IF NOT EXISTS client_notes (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT client_notes_type_check CHECK (note_type IN ('manual', 'system'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenders_submission_deadline ON tenders(submission_deadline);
CREATE INDEX IF NOT EXISTS idx_tenders_reference_number ON tenders(reference_number);
CREATE INDEX IF NOT EXISTS idx_extractions_url ON extractions(url);
