-- Migration 0008: Purchase order workflow

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number     VARCHAR(50)  UNIQUE NOT NULL,
  supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name VARCHAR(255) NOT NULL,
  status        VARCHAR(50)  NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','partial','received','cancelled')),
  notes         TEXT,
  expected_date DATE,
  sent_at       TIMESTAMPTZ,
  received_at   TIMESTAMPTZ,
  subtotal      DECIMAL(12,4) DEFAULT 0,
  gst_amount    DECIMAL(12,4) DEFAULT 0,
  total_value   DECIMAL(12,4) DEFAULT 0,
  created_by    UUID NOT NULL REFERENCES users(id),
  received_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id              UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id  UUID REFERENCES inventory_items(id),
  item_name          VARCHAR(255) NOT NULL,
  quantity_ordered   DECIMAL(10,3) NOT NULL,
  quantity_received  DECIMAL(10,3) DEFAULT 0,
  unit_cost          DECIMAL(10,4),
  gst_applicable     BOOLEAN DEFAULT true,
  notes              TEXT
);

CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1000;
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status   ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_created  ON purchase_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_items    ON purchase_order_items(po_id);
