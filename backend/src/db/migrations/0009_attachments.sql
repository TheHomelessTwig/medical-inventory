-- Migration 0009: File attachments for invoices, returns, purchase orders

CREATE TABLE IF NOT EXISTS attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   VARCHAR(50)  NOT NULL,   -- 'invoice' | 'return' | 'purchase_order'
  entity_id     UUID         NOT NULL,
  filename      VARCHAR(255) NOT NULL,   -- original filename
  stored_name   VARCHAR(255) NOT NULL,   -- UUID-based filename on disk
  mime_type     VARCHAR(100) NOT NULL,
  size_bytes    INTEGER      NOT NULL,
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);
