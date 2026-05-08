-- Migration 0005: Monthly category budgets
CREATE TABLE IF NOT EXISTS budgets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id    UUID REFERENCES categories(id) ON DELETE CASCADE,
  period_month   CHAR(7)  NOT NULL,  -- YYYY-MM
  budget_amount  DECIMAL(12,2) NOT NULL,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, period_month)
);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period_month);
