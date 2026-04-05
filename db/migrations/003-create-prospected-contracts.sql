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
