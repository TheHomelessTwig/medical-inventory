-- Migration 0002: Add TOTP / 2FA columns to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
