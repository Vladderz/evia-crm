CREATE TABLE IF NOT EXISTS tender_notes (
  id SERIAL PRIMARY KEY,
  tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT tender_notes_type_check CHECK (note_type IN ('manual', 'system'))
);

CREATE TABLE IF NOT EXISTS client_notes (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT client_notes_type_check CHECK (note_type IN ('manual', 'system'))
);
