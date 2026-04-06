CREATE TABLE sales_pipeline (
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
  CONSTRAINT sales_pipeline_status_check CHECK (status IN ('contacted', 'call_booked', 'call_done', 'contract_sent', 'agreed', 'not_interested'))
);

CREATE TABLE pipeline_notes (
  id SERIAL PRIMARY KEY,
  pipeline_id INTEGER NOT NULL REFERENCES sales_pipeline(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT pipeline_notes_type_check CHECK (note_type IN ('manual', 'system'))
);
