-- Migration 0021: Per-item reorder configuration for auto PO creation

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS auto_reorder        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reorder_quantity    DECIMAL(10,3);   -- qty to order; NULL = 2× reorder_threshold
