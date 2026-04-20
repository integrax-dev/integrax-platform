/**
 * Node catalog routes
 *
 * GET  /api/nodes                     — IntegraX node catalog (triggers, actions, helpers)
 * GET  /api/nodes/:id                 — single IntegraX node
 * GET  /api/nodes/category/:cat       — filtered by category
 *
 * GET  /api/ap/pieces                 — proxy: ALL 687+ Activepieces pieces from AP instance
 * GET  /api/ap/pieces/:name           — single AP piece with actions/triggers detail
 *
 * POST /api/tenants/:tenantId/trigger-subscriptions   — Activepieces registers webhook trigger
 * DELETE /api/tenants/:tenantId/trigger-subscriptions/:id
 * GET  /api/tenants/:tenantId/trigger-subscriptions
 */

import { Router } from 'express';
import { ulid } from 'ulid';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ALL_NODES, getNodeById, getNodesByCategory } from '@integrax/activepieces-piece';
import {
  saveWebhookSubscription,
  deleteWebhookSubscription,
  listSubscriptionsForTenant,
} from '../store/webhook-trigger-subscriptions.js';

export const nodesRouter = Router();

// ─── IntegraX node catalog ────────────────────────────────────────────────────

nodesRouter.get('/api/nodes', (_req, res) => {
  res.json({ success: true, data: ALL_NODES });
});

nodesRouter.get('/api/nodes/category/:category', (req, res) => {
  const nodes = getNodesByCategory(req.params['category'] as never);
  res.json({ success: true, data: nodes });
});

nodesRouter.get('/api/nodes/:id(*)', (req, res) => {
  const node = getNodeById(req.params['id']);
  if (!node) return res.status(404).json({ success: false, error: 'Node not found' });
  res.json({ success: true, data: node });
});

// ─── Activepieces pieces catalog proxy ───────────────────────────────────────
// Proxies requests to the configured AP instance so the IntegraX UI can show
// all available AP pieces (Gmail, Slack, Shopify, etc.) without hardcoding them.

function apBase(): string | null {
  return process.env.ACTIVEPIECES_BASE_URL ?? null;
}

function apHeaders(): Record<string, string> {
  const key = process.env.ACTIVEPIECES_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

nodesRouter.get('/api/ap/pieces', requireAuth, async (req, res, next) => {
  try {
    const base = apBase();
    if (!base) return res.status(503).json({ success: false, error: 'AP_NOT_CONFIGURED', message: 'ACTIVEPIECES_BASE_URL not set' });

    const qs = new URLSearchParams();
    if (req.query['release']) qs.set('release', req.query['release'] as string);
    if (req.query['includeHidden']) qs.set('includeHidden', req.query['includeHidden'] as string);

    let upstream: Response;
    try {
      upstream = await fetch(`${base}/v1/pieces?${qs}`, { headers: apHeaders(), signal: AbortSignal.timeout(8000) });
    } catch {
      return res.status(503).json({ success: false, error: 'AP_UNREACHABLE', message: `Activepieces at ${base} is not responding` });
    }
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { next(err); }
});

nodesRouter.get('/api/ap/pieces/:name', requireAuth, async (req, res, next) => {
  try {
    const base = apBase();
    if (!base) return res.status(503).json({ success: false, error: 'AP_NOT_CONFIGURED', message: 'ACTIVEPIECES_BASE_URL not set' });

    let upstream: Response;
    try {
      upstream = await fetch(
        `${base}/v1/pieces/${encodeURIComponent(req.params['name'])}`,
        { headers: apHeaders(), signal: AbortSignal.timeout(8000) },
      );
    } catch {
      return res.status(503).json({ success: false, error: 'AP_UNREACHABLE', message: `Activepieces at ${base} is not responding` });
    }
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { next(err); }
});

// ─── Webhook trigger subscriptions ───────────────────────────────────────────

nodesRouter.post(
  '/api/tenants/:tenantId/trigger-subscriptions',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const { tenantId } = req.params as { tenantId: string };
      const { eventType, callbackUrl, secret } = req.body as {
        eventType?: string; callbackUrl?: string; secret?: string;
      };
      if (!eventType || !callbackUrl) {
        return res.status(400).json({ success: false, error: 'eventType and callbackUrl are required' });
      }
      const sub = { id: ulid(), tenantId, eventType, callbackUrl, secret, createdAt: new Date() };
      await saveWebhookSubscription(sub);
      res.status(201).json({ success: true, data: sub });
    } catch (err) { next(err); }
  },
);

nodesRouter.get(
  '/api/tenants/:tenantId/trigger-subscriptions',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const subs = await listSubscriptionsForTenant(req.params['tenantId']);
      res.json({ success: true, data: subs });
    } catch (err) { next(err); }
  },
);

nodesRouter.delete(
  '/api/tenants/:tenantId/trigger-subscriptions/:id',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      await deleteWebhookSubscription(req.params['id']);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);
