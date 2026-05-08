-- Medical Inventory Management System
-- PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'doctor', 'nurse')),
  is_active BOOLEAN DEFAULT true,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  must_change_password BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVENTORY ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  sku VARCHAR(100) UNIQUE,
  barcode VARCHAR(100),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  unit VARCHAR(50) DEFAULT 'unit',
  quantity_on_hand DECIMAL(10,3) DEFAULT 0,
  quantity_reserved DECIMAL(10,3) DEFAULT 0,
  reorder_threshold DECIMAL(10,3) DEFAULT 0,
  internal_price DECIMAL(10,4),
  supplier_cost DECIMAL(10,4),
  gst_applicable BOOLEAN DEFAULT true,
  gst_rate DECIMAL(5,2) DEFAULT 10.00,
  storage_location VARCHAR(255),
  requires_batch_tracking BOOLEAN DEFAULT false,
  dispense_unit NUMERIC(10,3) NOT NULL DEFAULT 1,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_supplier ON inventory_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode ON inventory_items(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items(is_active);

-- ============================================================
-- INVENTORY BATCHES (Lot/Batch tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  lot_number VARCHAR(100),
  expiry_date DATE,
  quantity DECIMAL(10,3) NOT NULL DEFAULT 0,
  supplier_cost DECIMAL(10,4),
  received_date DATE DEFAULT CURRENT_DATE,
  invoice_id UUID,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inventory_item_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_batches_item ON inventory_batches(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry_date);

-- ============================================================
-- STOCK REQUESTS (Doctor → Nurse workflow)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number VARCHAR(50) UNIQUE NOT NULL,
  doctor_id UUID NOT NULL REFERENCES users(id),
  patient_name VARCHAR(255),
  patient_ref VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'in_progress', 'fulfilled', 'partially_fulfilled', 'cancelled')),
  priority VARCHAR(20) DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  notes TEXT,
  accepted_by UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  is_quick_charge BOOLEAN NOT NULL DEFAULT false,
  initiated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_requests_doctor ON stock_requests(doctor_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON stock_requests(created_at DESC);

CREATE TABLE IF NOT EXISTS stock_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES stock_requests(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  quantity_requested DECIMAL(10,3) NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_req_items_request ON stock_request_items(request_id);

-- ============================================================
-- STOCK FULFILLMENTS (Nurse completion record)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES stock_requests(id),
  nurse_id UUID NOT NULL REFERENCES users(id),
  fulfillment_number VARCHAR(50) UNIQUE NOT NULL,
  total_charge DECIMAL(10,4) DEFAULT 0,
  notes TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fulfillments_request ON stock_fulfillments(request_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_nurse ON stock_fulfillments(nurse_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_created ON stock_fulfillments(created_at DESC);

CREATE TABLE IF NOT EXISTS stock_fulfillment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id UUID NOT NULL REFERENCES stock_fulfillments(id) ON DELETE CASCADE,
  request_item_id UUID REFERENCES stock_request_items(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  batch_id UUID REFERENCES inventory_batches(id),
  quantity_used DECIMAL(10,3) NOT NULL,
  batch_number VARCHAR(100),
  lot_number VARCHAR(100),
  expiry_date DATE,
  internal_price DECIMAL(10,4),
  total_charge DECIMAL(10,4),
  is_substitution BOOLEAN DEFAULT false,
  substitution_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_items_fulfillment ON stock_fulfillment_items(fulfillment_id);

-- ============================================================
-- STOCK ADJUSTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  batch_id UUID REFERENCES inventory_batches(id),
  adjusted_by UUID NOT NULL REFERENCES users(id),
  adjustment_type VARCHAR(50) NOT NULL
    CHECK (adjustment_type IN ('increase', 'decrease', 'correction', 'damage', 'expiry', 'return', 'stocktake', 'other')),
  quantity_before DECIMAL(10,3),
  quantity_change DECIMAL(10,3) NOT NULL,
  quantity_after DECIMAL(10,3),
  reason TEXT NOT NULL,
  override_negative BOOLEAN DEFAULT false,
  reference_id UUID,
  reference_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adjustments_item ON stock_adjustments(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_created ON stock_adjustments(created_at DESC);

-- ============================================================
-- STOCKTAKES
-- ============================================================
CREATE TABLE IF NOT EXISTS stocktakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('full', 'cycle', 'partial')),
  scope_description TEXT,
  scope_category_id UUID REFERENCES categories(id),
  scope_location VARCHAR(255),
  status VARCHAR(50) DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES users(id),
  completed_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  total_items INTEGER DEFAULT 0,
  total_variance DECIMAL(10,3) DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stocktakes_status ON stocktakes(status);
CREATE INDEX IF NOT EXISTS idx_stocktakes_created ON stocktakes(started_at DESC);

CREATE TABLE IF NOT EXISTS stocktake_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  expected_quantity DECIMAL(10,3),
  counted_quantity DECIMAL(10,3),
  variance DECIMAL(10,3) GENERATED ALWAYS AS (
    CASE WHEN counted_quantity IS NOT NULL AND expected_quantity IS NOT NULL
    THEN counted_quantity - expected_quantity ELSE NULL END
  ) STORED,
  adjustment_applied BOOLEAN DEFAULT false,
  notes TEXT,
  counted_at TIMESTAMPTZ,
  counted_by UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_stocktake_items_stocktake ON stocktake_items(stocktake_id);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name VARCHAR(255) NOT NULL,
  invoice_date DATE,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal DECIMAL(10,4) DEFAULT 0,
  gst_amount DECIMAL(10,4) DEFAULT 0,
  total_value DECIMAL(10,4) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'received'
    CHECK (status IN ('received', 'verified', 'posted', 'cancelled')),
  entered_by UUID NOT NULL REFERENCES users(id),
  posted_by UUID REFERENCES users(id),
  posted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_received ON invoices(received_date DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id),
  item_name VARCHAR(255) NOT NULL,
  batch_number VARCHAR(100),
  lot_number VARCHAR(100),
  expiry_date DATE,
  quantity DECIMAL(10,3) NOT NULL,
  unit_cost DECIMAL(10,4) NOT NULL,
  gst_applicable BOOLEAN DEFAULT true,
  gst_amount DECIMAL(10,4) DEFAULT 0,
  total_cost DECIMAL(10,4),
  stock_updated BOOLEAN DEFAULT false,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_item ON invoice_items(inventory_item_id);

-- ============================================================
-- AUDIT LOG (Immutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  user_role VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  entity_name VARCHAR(255),
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','categories','suppliers','inventory_items','inventory_batches','stock_requests','invoices'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I; CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;

-- ============================================================
-- SEQUENCE for request/fulfillment numbers
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS request_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS fulfillment_number_seq START 1000;
