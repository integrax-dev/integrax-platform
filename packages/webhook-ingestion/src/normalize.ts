import type { IntegraxEventType } from '@integrax/event-bus';
import type { NormalizedWebhookPayload, WebhookIngestionConfig } from './types.js';

/**
 * Normaliza un payload crudo de webhook a un sobre estandar de plataforma.
 *
 * A proposito es una capa fina; la extraccion de campos especificos de cada
 * conector corresponde al gancho de webhook del propio conector, no a este
 * modulo generico.
 */
export function normalizePayload(
  raw: unknown,
  headers: Record<string, string>,
  config: WebhookIngestionConfig,
): NormalizedWebhookPayload {
  const eventType = resolveEventType(raw, config);
  const entityType = config.entityType ?? 'unknown';
  const entityId = tryExtractEntityId(raw);

  return {
    connectorId: config.connectorId,
    raw,
    headers,
    receivedAt: new Date().toISOString(),
    eventType,
    entityType,
    entityId,
  };
}

function resolveEventType(
  raw: unknown,
  config: WebhookIngestionConfig,
): IntegraxEventType {
  if (!config.eventTypeMap) return 'webhook.received';

  const rawType =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)['type'] ??
        (raw as Record<string, unknown>)['action'] ??
        (raw as Record<string, unknown>)['event']
      : undefined;

  if (typeof rawType === 'string' && config.eventTypeMap[rawType]) {
    return config.eventTypeMap[rawType];
  }
  return 'webhook.received';
}

function tryExtractEntityId(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  // Nombres de campo frecuentes entre conectores.
  for (const field of ['id', 'resource_id', 'object_id', 'data.id']) {
    const val = deepGet(obj, field);
    if (typeof val === 'string' || typeof val === 'number') {
      return String(val);
    }
  }
  return undefined;
}

function deepGet(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur !== null && typeof cur === 'object') {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
