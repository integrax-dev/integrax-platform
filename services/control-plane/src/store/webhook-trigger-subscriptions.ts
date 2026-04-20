import { pool } from './db.js';

export interface WebhookTriggerSubscription {
  id: string;
  tenantId: string;
  eventType: string;
  callbackUrl: string;
  secret?: string;
  createdAt: Date;
}

interface Row {
  id: string;
  tenant_id: string;
  event_type: string;
  callback_url: string;
  secret: string | null;
  created_at: Date;
}

function rowToSub(r: Row): WebhookTriggerSubscription {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    eventType: r.event_type,
    callbackUrl: r.callback_url,
    secret: r.secret ?? undefined,
    createdAt: r.created_at,
  };
}

export async function saveWebhookSubscription(sub: WebhookTriggerSubscription): Promise<void> {
  await pool.query(
    `INSERT INTO webhook_trigger_subscriptions (id, tenant_id, event_type, callback_url, secret, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id, event_type, callback_url) DO NOTHING`,
    [sub.id, sub.tenantId, sub.eventType, sub.callbackUrl, sub.secret ?? null, sub.createdAt],
  );
}

export async function deleteWebhookSubscription(id: string): Promise<void> {
  await pool.query('DELETE FROM webhook_trigger_subscriptions WHERE id = $1', [id]);
}

export async function getSubscriptionsByEvent(eventType: string): Promise<WebhookTriggerSubscription[]> {
  const result = await pool.query<Row>(
    'SELECT * FROM webhook_trigger_subscriptions WHERE event_type = $1',
    [eventType],
  );
  return result.rows.map(rowToSub);
}

export async function listSubscriptionsForTenant(tenantId: string): Promise<WebhookTriggerSubscription[]> {
  const result = await pool.query<Row>(
    'SELECT * FROM webhook_trigger_subscriptions WHERE tenant_id = $1 ORDER BY created_at ASC',
    [tenantId],
  );
  return result.rows.map(rowToSub);
}
