-- S.H.I.T. — Medical Practice Inventory Management System
-- PostgreSQL Schema (authoritative for fresh installs)
-- Incremental changes to existing DBs are handled by src/db/migrations/*.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SITES (multi-location support)
-- ============================================================
CREATE TABLE IF NOT EXISTS sites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) UNIQUE NOT NULL,
  address    TEXT,
  phone      VARCHAR(50),
  email      VARCHAR(255),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO sites (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Main Clinic')
  ON CONFLICT DO NOTHING;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                VARCHAR(255) UNIQUE NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  password_hash        VARCHAR(255) NOT NULL,
  role                 VARCHAR(50)  NOT NULL
                         CHECK (role IN (
                           'admin','doctor','nurse',
                           'practice_manager','receptionist','locum_doctor'
                         )),
  is_active            BOOLEAN NOT NULL DEFAULT true,
  site_id              UUID REFERENCES sites(id) ON DELETE SET NULL,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  last_login           TIMESTAMPTZ,
  must_change_password BOOLEAN DEFAULT false,
  totp_secret          VARCHAR(64),
  totp_enabled         BOOLEAN NOT NULL DEFAULT false,
  locum_expires_at     TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_site ON users(site_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

CREATE TABLE IF NOT EXISTS user_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_family VARCHAR(64) NOT NULL,
  ip_address   VARCHAR(50),
  user_agent   TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked      BOOLEAN NOT NULL DEFAULT false,
  revoked_at   TIMESTAMPTZ,
  revoked_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user   ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_family ON user_sessions(token_family);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, revoked, expires_at);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  color       VARCHAR(7) DEFAULT '#6366f1',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email        VARCHAR(255),
  phone        VARCHAR(50),
  address      TEXT,
  notes        TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVENTORY ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   VARCHAR(255) NOT NULL,
  description            TEXT,
  category_id            UUID REFERENCES categories(id) ON DELETE SET NULL,
  sku                    VARCHAR(100) UNIQUE,
  barcode                VARCHAR(100),
  supplier_id            UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  unit                   VARCHAR(50) DEFAULT 'unit',
  quantity_on_hand       DECIMAL(10,3) DEFAULT 0,
  quantity_reserved      DECIMAL(10,3) DEFAULT 0,
  reorder_threshold      DECIMAL(10,3) DEFAULT 0,
  internal_price         DECIMAL(10,4),
  supplier_cost          DECIMAL(10,4),
  gst_applicable         BOOLEAN DEFAULT true,
  gst_rate               DECIMAL(5,2) DEFAULT 10.00,
  storage_location       VARCHAR(255),
  requires_batch_tracking BOOLEAN DEFAULT false,
  dispense_unit          NUMERIC(10,3) NOT NULL DEFAULT 1,
  is_controlled          BOOLEAN NOT NULL DEFAULT false,
  controlled_schedule    VARCHAR(10),
  site_id                UUID REFERENCES sites(id) ON DELETE SET NULL,
  notes                  TEXT,
  is_active              BOOLEAN DEFAULT true,
  created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category   ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_supplier   ON inventory_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku        ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode    ON inventory_items(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_items_active     ON inventory_items(is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_site             ON inventory_items(site_id);
CREATE INDEX IF NOT EXISTS idx_inventory_controlled
  ON inventory_items(is_controlled) WHERE is_controlled = true;

-- ============================================================
-- INVENTORY BATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  batch_number      VARCHAR(100) NOT NULL,
  lot_number        VARCHAR(100),
  expiry_date       DATE,
  quantity          DECIMAL(10,3) NOT NULL DEFAULT 0,
  supplier_cost     DECIMAL(10,4),
  received_date     DATE DEFAULT CURRENT_DATE,
  invoice_id        UUID,
  notes             TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inventory_item_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_batches_item   ON inventory_batches(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry_date);

-- ============================================================
-- STOCK REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number      VARCHAR(50) UNIQUE NOT NULL,
  doctor_id           UUID NOT NULL REFERENCES users(id),
  patient_name        VARCHAR(255),
  patient_ref         VARCHAR(100),
  status              VARCHAR(50) DEFAULT 'pending'
                        CHECK (status IN (
                          'pending','accepted','in_progress',
                          'fulfilled','partially_fulfilled','cancelled'
                        )),
  priority            VARCHAR(20) DEFAULT 'normal'
                        CHECK (priority IN ('low','normal','high','urgent')),
  notes               TEXT,
  accepted_by         UUID REFERENCES users(id),
  accepted_at         TIMESTAMPTZ,
  cancelled_by        UUID REFERENCES users(id),
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  is_quick_charge     BOOLEAN NOT NULL DEFAULT false,
  initiated_by        UUID REFERENCES users(id),
  site_id             UUID REFERENCES sites(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_requests_doctor  ON stock_requests(doctor_id);
CREATE INDEX IF NOT EXISTS idx_requests_status  ON stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON stock_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_site    ON stock_requests(site_id);

CREATE TABLE IF NOT EXISTS stock_request_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         UUID NOT NULL REFERENCES stock_requests(id) ON DELETE CASCADE,
  inventory_item_id  UUID NOT NULL REFERENCES inventory_items(id),
  quantity_requested DECIMAL(10,3) NOT NULL,
  notes              TEXT
);
CREATE INDEX IF NOT EXISTS idx_req_items_request ON stock_request_items(request_id);

-- ============================================================
-- STOCK FULFILLMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_fulfillments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        UUID NOT NULL REFERENCES stock_requests(id),
  nurse_id          UUID NOT NULL REFERENCES users(id),
  fulfillment_number VARCHAR(50) UNIQUE NOT NULL,
  total_charge      DECIMAL(10,4) DEFAULT 0,
  notes             TEXT,
  completed_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fulfillments_request ON stock_fulfillments(request_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_nurse   ON stock_fulfillments(nurse_id);
CREATE INDEX IF NOT EXISTS idx_fulfillments_created ON stock_fulfillments(created_at DESC);

CREATE TABLE IF NOT EXISTS stock_fulfillment_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id    UUID NOT NULL REFERENCES stock_fulfillments(id) ON DELETE CASCADE,
  request_item_id   UUID REFERENCES stock_request_items(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  batch_id          UUID REFERENCES inventory_batches(id),
  quantity_used     DECIMAL(10,3) NOT NULL,
  batch_number      VARCHAR(100),
  lot_number        VARCHAR(100),
  expiry_date       DATE,
  internal_price    DECIMAL(10,4),
  total_charge      DECIMAL(10,4),
  is_substitution   BOOLEAN DEFAULT false,
  substitution_reason TEXT,
  witness_name      VARCHAR(255),
  witness_role      VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_items_fulfillment ON stock_fulfillment_items(fulfillment_id);

-- ============================================================
-- STOCK ADJUSTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  batch_id          UUID REFERENCES inventory_batches(id),
  adjusted_by       UUID NOT NULL REFERENCES users(id),
  adjustment_type   VARCHAR(50) NOT NULL
                      CHECK (adjustment_type IN (
                        'increase','decrease','correction','damage',
                        'expiry','return','stocktake','wastage','other'
                      )),
  quantity_before   DECIMAL(10,3),
  quantity_change   DECIMAL(10,3) NOT NULL,
  quantity_after    DECIMAL(10,3),
  reason            TEXT NOT NULL,
  wastage_reason    VARCHAR(100),
  override_negative BOOLEAN DEFAULT false,
  reference_id      UUID,
  reference_type    VARCHAR(50),
  site_id           UUID REFERENCES sites(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adjustments_item    ON stock_adjustments(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_created ON stock_adjustments(created_at DESC);

-- ============================================================
-- STOCKTAKES
-- ============================================================
CREATE TABLE IF NOT EXISTS stocktakes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  type             VARCHAR(50)  NOT NULL CHECK (type IN ('full','cycle','partial')),
  scope_description TEXT,
  scope_category_id UUID REFERENCES categories(id),
  scope_location   VARCHAR(255),
  status           VARCHAR(50)  DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress','completed','cancelled')),
  created_by       UUID NOT NULL REFERENCES users(id),
  completed_by     UUID REFERENCES users(id),
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  notes            TEXT,
  total_items      INTEGER DEFAULT 0,
  total_variance   DECIMAL(10,3) DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stocktakes_status  ON stocktakes(status);
CREATE INDEX IF NOT EXISTS idx_stocktakes_created ON stocktakes(started_at DESC);

CREATE TABLE IF NOT EXISTS stocktake_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id      UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  expected_quantity DECIMAL(10,3),
  counted_quantity  DECIMAL(10,3),
  variance          DECIMAL(10,3) GENERATED ALWAYS AS (
    CASE WHEN counted_quantity IS NOT NULL AND expected_quantity IS NOT NULL
    THEN counted_quantity - expected_quantity ELSE NULL END
  ) STORED,
  version           INTEGER NOT NULL DEFAULT 0,
  adjustment_applied BOOLEAN DEFAULT false,
  notes             TEXT,
  counted_at        TIMESTAMPTZ,
  counted_by        UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_stocktake_items_stocktake ON stocktake_items(stocktake_id);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  supplier_id    UUID REFERENCES suppliers(id),
  supplier_name  VARCHAR(255) NOT NULL,
  invoice_date   DATE,
  received_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date       DATE,
  subtotal       DECIMAL(10,4) DEFAULT 0,
  gst_amount     DECIMAL(10,4) DEFAULT 0,
  total_value    DECIMAL(10,4) DEFAULT 0,
  status         VARCHAR(50) DEFAULT 'received'
                   CHECK (status IN ('received','verified','posted','cancelled')),
  entered_by     UUID NOT NULL REFERENCES users(id),
  posted_by      UUID REFERENCES users(id),
  posted_at      TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_received ON invoices(received_date DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id),
  item_name         VARCHAR(255) NOT NULL,
  batch_number      VARCHAR(100),
  lot_number        VARCHAR(100),
  expiry_date       DATE,
  quantity          DECIMAL(10,3) NOT NULL,
  unit_cost         DECIMAL(10,4) NOT NULL,
  gst_applicable    BOOLEAN DEFAULT true,
  gst_amount        DECIMAL(10,4) DEFAULT 0,
  total_cost        DECIMAL(10,4),
  stock_updated     BOOLEAN DEFAULT false,
  notes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_item    ON invoice_items(inventory_item_id);

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
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
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id             UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id),
  item_name         VARCHAR(255) NOT NULL,
  quantity_ordered  DECIMAL(10,3) NOT NULL,
  quantity_received DECIMAL(10,3) DEFAULT 0,
  unit_cost         DECIMAL(10,4),
  gst_applicable    BOOLEAN DEFAULT true,
  notes             TEXT
);

CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1000;
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status   ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_created  ON purchase_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_items    ON purchase_order_items(po_id);

-- ============================================================
-- SUPPLIER RETURNS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_returns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name VARCHAR(255) NOT NULL,
  status        VARCHAR(50) NOT NULL DEFAULT 'draft'
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
CREATE INDEX IF NOT EXISTS idx_stock_returns_status     ON stock_returns(status);
CREATE INDEX IF NOT EXISTS idx_stock_return_items_return ON stock_return_items(return_id);

-- ============================================================
-- ATTACHMENTS (invoices, returns, purchase orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  VARCHAR(50)  NOT NULL,
  entity_id    UUID         NOT NULL,
  filename     VARCHAR(255) NOT NULL,
  stored_name  VARCHAR(255) NOT NULL,
  mime_type    VARCHAR(100) NOT NULL,
  size_bytes   INTEGER      NOT NULL,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

-- ============================================================
-- REQUEST TEMPLATES (all roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS request_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  items      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, name)
);
CREATE INDEX IF NOT EXISTS idx_templates_user ON request_templates(doctor_id);

-- ============================================================
-- BUDGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID REFERENCES categories(id) ON DELETE CASCADE,
  period_month  CHAR(7) NOT NULL,
  budget_amount DECIMAL(12,2) NOT NULL,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, period_month)
);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period_month);

-- ============================================================
-- AUDIT LOG (Immutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name   VARCHAR(255),
  user_role   VARCHAR(50),
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id   VARCHAR(255),
  entity_name VARCHAR(255),
  old_values  JSONB,
  new_values  JSONB,
  ip_address  VARCHAR(50),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- Archive for old audit records
CREATE TABLE IF NOT EXISTS audit_log_archive (LIKE audit_log INCLUDING ALL);
CREATE INDEX IF NOT EXISTS idx_audit_archive_created ON audit_log_archive(created_at DESC);

-- ============================================================
-- DATA RETENTION CONFIGURATION
-- ============================================================
CREATE TABLE IF NOT EXISTS data_retention_config (
  id                       INTEGER PRIMARY KEY DEFAULT 1,
  audit_log_retain_days    INTEGER NOT NULL DEFAULT 2555,
  patient_data_retain_days INTEGER NOT NULL DEFAULT 2555,
  anonymise_patient_refs   BOOLEAN NOT NULL DEFAULT false,
  last_retention_run       TIMESTAMPTZ,
  updated_by               UUID REFERENCES users(id),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO data_retention_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================================
-- SYSTEM / BRANDING CONFIGURATION
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  practice_name    VARCHAR(255) NOT NULL DEFAULT 'S.H.I.T.',
  practice_tagline VARCHAR(255) NOT NULL DEFAULT 'Sam''s Helpful Inventory Tracker',
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT system_config_single_row CHECK (id = 1)
);
INSERT INTO system_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================================
-- EXPIRY ALERT CONFIGURATION
-- ============================================================
CREATE TABLE IF NOT EXISTS expiry_alert_config (
  id             INTEGER PRIMARY KEY DEFAULT 1,
  alert_days_out INTEGER[] NOT NULL DEFAULT '{30,14,7,1}',
  email_admins   BOOLEAN NOT NULL DEFAULT true,
  email_nurses   BOOLEAN NOT NULL DEFAULT true,
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT expiry_alert_single_row CHECK (id = 1)
);
INSERT INTO expiry_alert_config (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS expiry_alert_sent (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id  UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  days_out  INTEGER NOT NULL,
  sent_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(batch_id, days_out)
);
CREATE INDEX IF NOT EXISTS idx_expiry_alert_batch ON expiry_alert_sent(batch_id);

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
  FOREACH t IN ARRAY ARRAY[
    'users','categories','suppliers','inventory_items','inventory_batches',
    'stock_requests','invoices','purchase_orders','stock_returns','sites'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I;
       CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;

-- ============================================================
-- SEQUENCES
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS request_number_seq     START 1000;
CREATE SEQUENCE IF NOT EXISTS fulfillment_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS return_number_seq      START 1000;
CREATE SEQUENCE IF NOT EXISTS po_number_seq          START 1000;
