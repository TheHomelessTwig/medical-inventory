-- Migration 0015: Practice branding / display name configuration

CREATE TABLE IF NOT EXISTS system_config (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  practice_name    VARCHAR(255) NOT NULL DEFAULT 'S.H.I.T.',
  practice_tagline VARCHAR(255) NOT NULL DEFAULT 'Sam''s Helpful Inventory Tracker',
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT system_config_single_row CHECK (id = 1)
);

INSERT INTO system_config (id) VALUES (1) ON CONFLICT DO NOTHING;
