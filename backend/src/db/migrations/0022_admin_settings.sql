-- Migration 0022: Admin-editable settings (replaces most .env configuration)
-- Env vars are used as fallback defaults on first boot.

CREATE TABLE IF NOT EXISTS admin_settings (
  id                       INTEGER PRIMARY KEY DEFAULT 1,

  -- ── Email / SMTP ──────────────────────────────────────────────────────────
  smtp_host                VARCHAR(255),
  smtp_port                INTEGER      DEFAULT 587,
  smtp_secure              BOOLEAN      NOT NULL DEFAULT false,
  smtp_user                VARCHAR(255),
  smtp_pass                VARCHAR(255),          -- stored as plaintext (same risk as .env)
  smtp_from                VARCHAR(255) DEFAULT 'noreply@clinic.local',
  app_url                  VARCHAR(255) DEFAULT 'http://localhost:3000',

  -- ── Security ──────────────────────────────────────────────────────────────
  session_timeout_minutes  INTEGER NOT NULL DEFAULT 30,
  max_login_attempts       INTEGER NOT NULL DEFAULT 5,
  lockout_minutes          INTEGER NOT NULL DEFAULT 15,

  -- ── Scheduled jobs ────────────────────────────────────────────────────────
  report_timezone          VARCHAR(100) NOT NULL DEFAULT 'UTC',

  -- ── Built-in database backup ──────────────────────────────────────────────
  backup_enabled           BOOLEAN NOT NULL DEFAULT false,
  backup_schedule          VARCHAR(20)  NOT NULL DEFAULT 'daily',  -- daily | weekly
  backup_retain_days       INTEGER NOT NULL DEFAULT 30,
  backup_dir               VARCHAR(255) DEFAULT '/opt/medinv/backups',

  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_by               UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT admin_settings_single_row CHECK (id = 1)
);

INSERT INTO admin_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Seed from env vars where possible (noop if already seeded)
-- The application reads env vars as fallback when the column is NULL.
