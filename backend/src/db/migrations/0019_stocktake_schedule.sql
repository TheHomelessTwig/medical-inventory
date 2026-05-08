-- Migration 0019: Scheduled stocktake configuration

CREATE TABLE IF NOT EXISTS stocktake_schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  frequency         VARCHAR(20) NOT NULL
                      CHECK (frequency IN ('weekly','monthly','quarterly')),
  -- Day within the period: 1-7 for weekly (Mon=1), 1-28 for monthly/quarterly
  day_of_period     INTEGER NOT NULL DEFAULT 1,
  stocktake_type    VARCHAR(20) NOT NULL DEFAULT 'full'
                      CHECK (stocktake_type IN ('full','partial')),
  scope_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  scope_location    VARCHAR(255),
  notify_emails     TEXT[],        -- extra email addresses to notify
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_run_at       TIMESTAMPTZ,
  next_due_at       TIMESTAMPTZ,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stocktake_schedules_active ON stocktake_schedules(is_active, next_due_at);
