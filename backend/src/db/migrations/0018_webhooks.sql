-- Migration 0018: Outbound webhooks

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url         TEXT NOT NULL,
  events      TEXT[] NOT NULL DEFAULT '{}',
  secret      VARCHAR(255) NOT NULL,    -- HMAC-SHA256 signing secret
  description VARCHAR(255),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event           VARCHAR(100) NOT NULL,
  payload         JSONB NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','delivered','failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_code   INTEGER,
  response_body   TEXT,
  next_retry_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_active  ON webhook_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_del_pending  ON webhook_deliveries(status, next_retry_at)
  WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_webhook_del_sub      ON webhook_deliveries(subscription_id);
