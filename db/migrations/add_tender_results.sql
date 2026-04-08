CREATE TABLE IF NOT EXISTS tender_results (
  id SERIAL PRIMARY KEY,
  tender_name VARCHAR(255) NOT NULL,
  client_name VARCHAR(255),
  contracting_authority VARCHAR(255),
  estimated_budget NUMERIC(12,2),
  our_price NUMERIC(12,2),
  bids_received INTEGER,
  winning_price NUMERIC(12,2),
  quality_price_weighting VARCHAR(10),
  outcome VARCHAR(20) CHECK (outcome IN ('Won', 'Lost', 'Awaiting')) DEFAULT 'Awaiting',
  position INTEGER,
  submitted_date DATE,
  notes TEXT,
  tender_url VARCHAR(500),
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
