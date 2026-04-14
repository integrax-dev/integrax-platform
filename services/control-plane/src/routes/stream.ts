/**
 * GET /api/stream — Unified real-time SSE endpoint.
 *
 * A single persistent connection from the admin panel receives ALL platform
 * events: tenant changes, connector status, workflow updates, schema drift
 * incidents, and processed/failed events.
 *
 * Protocol:
 *   - Each SSE message has `event: <type>` + `data: <JSON envelope>`
 *   - Envelope shape: { type, data, ts }  (PlatformEvent)
 *   - Heartbeat comment every 25 s to keep proxies alive
 *   - `event: connected` with { connected: true } is sent immediately on open
 *
 * Auth: same JWT/ApiKey as all other routes.
 * Roles: any authenticated role can subscribe (read-only stream).
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  platformEmitter,
  ALL_PLATFORM_EVENT_TYPES,
  type PlatformEventType,
} from '../platform/platform-emitter.js';

export const streamRouter = Router();

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

    // Register one handler per event type
    const handlers = new Map<PlatformEventType, (envelope: unknown) => void>();

    for (const type of ALL_PLATFORM_EVENT_TYPES) {
      const handler = (envelope: unknown) => {
        if (res.writableEnded) return;
        res.write(`event: ${type}\ndata: ${JSON.stringify(envelope)}\n\n`);
      };
      handlers.set(type, handler);
      platformEmitter.on(type, handler);
    }

    // Heartbeat every 25 s — prevents load-balancers from closing idle connections
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 25_000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      for (const [type, handler] of handlers) {
        platformEmitter.off(type, handler);
      }
    });
  },
);
