-- Migration 0014: Expiry alert configuration

CREATE TABLE IF NOT EXISTS expiry_alert_config (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  alert_days_out      INTEGER[] NOT NULL DEFAULT '{30,14,7,1}',  -- alert at these days-before-expiry
  email_admins        BOOLEAN NOT NULL DEFAULT true,
  email_nurses        BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT expiry_alert_single_row CHECK (id = 1)
);

INSERT INTO expiry_alert_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Track which (batch, days_out) combinations have already been alerted
-- to avoid duplicate emails on re-runs
CREATE TABLE IF NOT EXISTS expiry_alert_sent (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  days_out   INTEGER NOT NULL,
  sent_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(batch_id, days_out)
);
CREATE INDEX IF NOT EXISTS idx_expiry_alert_batch ON expiry_alert_sent(batch_id);
