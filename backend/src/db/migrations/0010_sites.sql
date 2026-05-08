-- Migration 0010: Multi-site support

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

-- Default site so existing rows satisfy the FK
INSERT INTO sites (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Main Clinic')
  ON CONFLICT DO NOTHING;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

ALTER TABLE stock_requests
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

ALTER TABLE stock_adjustments
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

-- Index for per-site queries
CREATE INDEX IF NOT EXISTS idx_users_site     ON users(site_id);
CREATE INDEX IF NOT EXISTS idx_inventory_site ON inventory_items(site_id);
CREATE INDEX IF NOT EXISTS idx_requests_site  ON stock_requests(site_id);
