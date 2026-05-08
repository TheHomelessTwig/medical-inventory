-- Migration 0001: Add wastage support to stock_adjustments
-- Idempotent: safe to run on existing schema

ALTER TABLE stock_adjustments
  DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;

ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_adjustment_type_check
    CHECK (adjustment_type IN (
      'increase','decrease','correction','damage',
      'expiry','return','stocktake','wastage','other'
    ));

ALTER TABLE stock_adjustments
  ADD COLUMN IF NOT EXISTS wastage_reason VARCHAR(100);
