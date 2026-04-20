-- Activepieces webhook trigger subscriptions
-- When Activepieces enables a trigger, it registers a callback URL here.
-- IntegraX POSTs to that URL when the matching event fires.
CREATE TABLE IF NOT EXISTS webhook_trigger_subscriptions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  secret      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_webhook_sub UNIQUE (tenant_id, event_type, callback_url)
);

CREATE INDEX IF NOT EXISTS idx_webhook_sub_event ON webhook_trigger_subscriptions(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_sub_tenant ON webhook_trigger_subscriptions(tenant_id);
