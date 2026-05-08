-- Migration 0003: Request / charge templates (all roles)
CREATE TABLE IF NOT EXISTS request_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  items      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, name)
);
CREATE INDEX IF NOT EXISTS idx_templates_user ON request_templates(doctor_id);
