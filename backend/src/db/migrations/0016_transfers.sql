-- Migration 0016: Stock transfers between sites

CREATE TABLE IF NOT EXISTS stock_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number VARCHAR(50) UNIQUE NOT NULL,
  from_site_id    UUID NOT NULL REFERENCES sites(id),
  to_site_id      UUID NOT NULL REFERENCES sites(id),
  status          VARCHAR(50) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','in_transit','received','cancelled')),
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  dispatched_by   UUID REFERENCES users(id),
  dispatched_at   TIMESTAMPTZ,
  received_by     UUID REFERENCES users(id),
  received_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id       UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  batch_id          UUID REFERENCES inventory_batches(id),
  batch_number      VARCHAR(100),
  quantity_sent     DECIMAL(10,3) NOT NULL,
  quantity_received DECIMAL(10,3) DEFAULT 0,
  notes             TEXT
);

CREATE SEQUENCE IF NOT EXISTS transfer_number_seq START 1000;
CREATE INDEX IF NOT EXISTS idx_transfers_from ON stock_transfers(from_site_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to   ON stock_transfers(to_site_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfer_items  ON stock_transfer_items(transfer_id);
