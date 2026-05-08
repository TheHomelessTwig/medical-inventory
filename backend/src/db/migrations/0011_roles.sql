-- Migration 0011: Extended role set + locum expiry

-- Drop and recreate CHECK to include new roles
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
    CHECK (role IN (
      'admin', 'doctor', 'nurse',
      'practice_manager', 'receptionist', 'locum_doctor'
    ));

-- Locum access expiry (NULL = no expiry)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locum_expires_at TIMESTAMPTZ;
