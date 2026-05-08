-- Migration 0017: Supplier recall management

CREATE TABLE IF NOT EXISTS recalls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_number   VARCHAR(50) UNIQUE NOT NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name   VARCHAR(255),
  batch_numbers   TEXT[] NOT NULL DEFAULT '{}',   -- batch numbers affected
  item_ids        UUID[] NOT NULL DEFAULT '{}',   -- inventory items affected
  severity        VARCHAR(20) NOT NULL DEFAULT 'moderate'
                    CHECK (severity IN ('low','moderate','high','critical')),
  status          VARCHAR(50) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','quarantined','disposed','closed')),
  regulatory_ref  VARCHAR(255),    -- TGA recall number etc.
  action_required TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  closed_by       UUID REFERENCES users(id),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS recall_number_seq START 1000;
CREATE INDEX IF NOT EXISTS idx_recalls_status ON recalls(status);
CREATE INDEX IF NOT EXISTS idx_recalls_created ON recalls(created_at DESC);
