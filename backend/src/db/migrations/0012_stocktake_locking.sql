-- Migration 0012: Optimistic locking for concurrent stocktake edits
-- Each update must pass the current version number; mismatches return 409.

ALTER TABLE stocktake_items
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
