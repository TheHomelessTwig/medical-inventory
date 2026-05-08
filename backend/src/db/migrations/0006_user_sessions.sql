-- Migration 0006: User session tracking for revocation
-- Each login / refresh creates a session row; logout + admin revoke mark it revoked.

CREATE TABLE IF NOT EXISTS user_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_family VARCHAR(64) NOT NULL,        -- ties access+refresh pair together
  ip_address   VARCHAR(50),
  user_agent   TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked      BOOLEAN NOT NULL DEFAULT false,
  revoked_at   TIMESTAMPTZ,
  revoked_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user    ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_family  ON user_sessions(token_family);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active  ON user_sessions(user_id, revoked, expires_at);
