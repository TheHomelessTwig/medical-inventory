-- Migration 0007: Controlled / Schedule 8 drug support

-- Flag on inventory items
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS is_controlled       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS controlled_schedule VARCHAR(10);   -- 'S4','S8','S4D', etc.

-- Witness columns on fulfilment line items (required for S8 dispensing)
ALTER TABLE stock_fulfillment_items
  ADD COLUMN IF NOT EXISTS witness_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS witness_role VARCHAR(100);

-- Partial index for quick controlled-drug lookups
CREATE INDEX IF NOT EXISTS idx_inventory_controlled
  ON inventory_items(is_controlled)
  WHERE is_controlled = true;
