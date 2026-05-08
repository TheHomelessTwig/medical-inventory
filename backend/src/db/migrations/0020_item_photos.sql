-- Migration 0020: Item photo on inventory items
-- Stored via the existing attachments system (entity_type = 'inventory_item')
-- This migration also adds 'inventory_item' as a valid reference for the photo
-- displayed in the inventory UI.
-- No schema change needed — we just document that entity_type 'inventory_item'
-- is now valid. A single "primary photo" is tracked via a column for fast display.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS photo_attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL;
