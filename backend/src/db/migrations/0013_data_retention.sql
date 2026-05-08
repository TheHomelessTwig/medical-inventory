-- Migration 0013: Data retention configuration + audit log archive

-- Retention configuration (single-row settings table)
CREATE TABLE IF NOT EXISTS data_retention_config (
  id                         INTEGER PRIMARY KEY DEFAULT 1,
  audit_log_retain_days      INTEGER NOT NULL DEFAULT 2555,  -- 7 years (medical records)
  patient_data_retain_days   INTEGER NOT NULL DEFAULT 2555,
  anonymise_patient_refs     BOOLEAN NOT NULL DEFAULT false,
  last_retention_run         TIMESTAMPTZ,
  updated_by                 UUID REFERENCES users(id),
  updated_at                 TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO data_retention_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Archive table for old audit log entries
CREATE TABLE IF NOT EXISTS audit_log_archive (
  LIKE audit_log INCLUDING ALL
);
CREATE INDEX IF NOT EXISTS idx_audit_archive_created ON audit_log_archive(created_at DESC);
