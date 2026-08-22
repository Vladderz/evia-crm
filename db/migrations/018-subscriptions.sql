-- Recurring software subscriptions tracked across the business.
-- Applied directly on Railway; this file is kept for the record.
-- Filed as 018 because 017 is already taken by add-waiting-room-stage.

CREATE TABLE subscriptions (
  id                  SERIAL PRIMARY KEY,
  service_name        TEXT NOT NULL,
  owner               TEXT NOT NULL CHECK (owner IN ('evia_consultancy','vlad','tristan')),
  category            TEXT,
  amount              NUMERIC(10,2) NOT NULL,
  billing_cycle       TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','quarterly','annual')),
  renewal_anchor_date DATE NOT NULL,
  payment_method      TEXT NOT NULL DEFAULT 'Tide Business',
  management_url      TEXT,
  account_email       TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
