/**
 * GET /api/stream — Unified real-time SSE endpoint.
 *
 * A single persistent connection from the admin panel receives ALL platform
 * events: tenant changes, connector status, workflow updates, schema drift
 * incidents, and processed/failed events.
 *
 * Protocol:
 *   - Each SSE message has `event: <type>` + `data: <JSON envelope>`
 *   - Envelope shape: see SanitizedPlatformEvent in frontend
 *   - Heartbeat comment every 25 s to keep proxies alive
 *   - `event: connected` with { connected: true } is sent immediately on open
 *
 * Auth: same JWT/ApiKey as all other routes.
 * Roles: any authenticated role can subscribe (read-only stream).
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { eventBus } from '../platform/container.js';
import type { IntegraxEvent } from '@integrax/event-bus';

export const streamRouter = Router();

function sanitizeEventForAdmin(event: IntegraxEvent): unknown {
  const metadata: Record<string, any> = {};

  // Preserve non-sensitive, admin-relevant metadata so the frontend UI can function
  if (event.type.startsWith('tenant.') && event.payload) {
    const p = event.payload as any;
    metadata.id = p.id;
    metadata.name = p.name;
    metadata.plan = p.plan;
    metadata.status = p.status;
    metadata.createdAt = p.createdAt;
  } else if (event.type.startsWith('event.') && event.payload) {
    const p = event.payload as any;
    metadata.id = p.id;
    metadata.type = p.type;
    metadata.tenant = p.tenant;
    metadata.connector = p.connector;
    metadata.status = p.status;
    metadata.time = p.time;
    metadata.error = p.error;
  }
  
  // NOTE: Operations, webhooks, and raw payloads are explicitly excluded.

  return {
    tenantId: event.tenantId,
    eventType: event.type,
    sourceSystem: event.sourceSystem,
    entityType: event.entityType,
    correlationId: event.correlationId,
    createdAt: (event.occurredAt || new Date()).toISOString(),
    severity: (event.payload as any)?.severity,
    status: (event.payload as any)?.status,
    latencyMs: (event.payload as any)?.latencyMs,
    counts: (event.payload as any)?.counts,
    confidence: (event.payload as any)?.confidence,
    errorCode: (event.payload as any)?.errorCode,
    fingerprint: (event.payload as any)?.fingerprint,
    hash: (event.payload as any)?.hash,
    metadata,
  };
}

streamRouter.get(
  '/',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  (req, res) => {
    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    // Confirm connection to the client
    res.write('event: connected\ndata: {"connected":true}\n\n');

    const handler = (event: IntegraxEvent) => {
      if (res.writableEnded) return;
      const sanitized = sanitizeEventForAdmin(event);
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(sanitized)}\n\n`);
    };

    const unsubscribe = eventBus.subscribeAll(handler, { name: 'admin-stream' });

    // Heartbeat every 25 s — prevents load-balancers from closing idle connections
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 25_000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  },
);
