-- Migration 0004: Stock returns to supplier
CREATE TABLE IF NOT EXISTS stock_returns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number VARCHAR(50)  UNIQUE NOT NULL,
  supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name VARCHAR(255) NOT NULL,
  status        VARCHAR(50)  NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','confirmed','cancelled')),
  notes         TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  confirmed_by  UUID REFERENCES users(id),
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_return_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id         UUID NOT NULL REFERENCES stock_returns(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  item_name         VARCHAR(255) NOT NULL,
  batch_id          UUID REFERENCES inventory_batches(id),
  batch_number      VARCHAR(100),
  quantity          DECIMAL(10,3) NOT NULL,
  unit_cost         DECIMAL(10,4),
  reason            TEXT
);

CREATE SEQUENCE IF NOT EXISTS return_number_seq START 1000;
CREATE INDEX IF NOT EXISTS idx_stock_returns_status ON stock_returns(status);
CREATE INDEX IF NOT EXISTS idx_stock_return_items_return ON stock_return_items(return_id);
