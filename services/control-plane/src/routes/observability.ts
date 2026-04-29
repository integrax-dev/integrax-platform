/**
 * Observability Kernel routes — platform_admin only
 *
 *   GET  /api/admin/observability/signals            list consistency signals (platform-wide)
 *   GET  /api/admin/observability/cases/summary      case counts by status + caseType
 *   GET  /api/admin/observability/tenant-sync-health list tenant sync health snapshots
 *   GET  /api/admin/observability/tenant-sync-health/:tenantId
 *   POST /api/admin/observability/tenant-sync-health/:tenantId/sync-result
 *   GET  /api/admin/observability/contract-changes   list connector contract changes
 *   POST /api/admin/observability/contract-changes/detect
 *   GET  /api/admin/observability/contract-baselines/:connectorId
 *   POST /api/admin/observability/contract-baselines
 *   GET  /api/admin/observability/runtime-status
 *   GET  /api/admin/observability/timeline              admin-safe timeline entries
 *   GET  /api/admin/observability/timeline/summary      count by kind per tenant
 *   GET  /api/admin/observability/timeline/platform     cross-tenant aggregation
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  signalService,
  contractRegistry,
  consistencyTimeline,
} from '../platform/container/consistency.js';
import {
  getTenantSyncHealth,
  listTenantSyncHealth,
  recordConnectorSyncResult,
} from '../store/pg-sync-health-store.js';
import {
  getContractBaseline,
  upsertContractBaseline,
  listContractChanges,
  saveContractChange,
} from '../store/pg-contract-store.js';
import type { ContractChangeFilter } from '@integrax/connector-contract';

export const observabilityAdminRouter = Router();

// ─── Signals (platform-wide summary — no field values) ───────────────────────

observabilityAdminRouter.get(
  '/signals',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const tenantId = req.query['tenantId'] as string | undefined;
      const entityType = req.query['entityType'] as string | undefined;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'tenantId required' } });
      }
      const signals = signalService.listSignals(tenantId, { entityType });
      // Strip any accidental value fields — return structural metadata only
      const safe = signals.map(s => ({
        id: s.id, tenantId: s.tenantId, kind: s.kind, severity: s.severity,
        entityType: s.entityType, connectorA: s.connectorA, connectorB: s.connectorB,
        fieldPath: s.fieldPath, tags: s.tags, deduplicationKey: s.deduplicationKey,
        occurredAt: s.occurredAt, resolvedAt: s.resolvedAt, caseId: s.caseId,
      }));
      res.json({ success: true, data: safe });
    } catch (err) { next(err); }
  },
);

// ─── Cases summary ────────────────────────────────────────────────────────────

observabilityAdminRouter.get(
  '/cases/summary',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const tenantId = req.query['tenantId'] as string | undefined;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'tenantId required' } });
      }
      const cases = signalService.listCases(tenantId);
      const byStatus: Record<string, number> = {};
      const byCaseType: Record<string, number> = {};
      for (const c of cases) {
        byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
        byCaseType[c.caseType] = (byCaseType[c.caseType] ?? 0) + 1;
      }
      res.json({
        success: true,
        data: {
          total: cases.length,
          byStatus,
          byCaseType,
          openCount: byStatus['open'] ?? 0,
        },
      });
    } catch (err) { next(err); }
  },
);

// ─── Tenant sync health ───────────────────────────────────────────────────────

observabilityAdminRouter.get(
  '/tenant-sync-health',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const criticalityTier = req.query['criticalityTier'] as string | undefined;
      const list = await listTenantSyncHealth(criticalityTier ? { criticalityTier } : {});
      res.json({ success: true, data: list });
    } catch (err) { next(err); }
  },
);

observabilityAdminRouter.get(
  '/tenant-sync-health/:tenantId',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const h = await getTenantSyncHealth(req.params['tenantId']);
      if (!h) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No health record' } });
      res.json({ success: true, data: h });
    } catch (err) { next(err); }
  },
);

observabilityAdminRouter.post(
  '/tenant-sync-health/:tenantId/sync-result',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const { connectorId, success, lagMs } = req.body as {
        connectorId: string; success: boolean; lagMs?: number;
      };
      if (!connectorId) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'connectorId required' } });
      }
      const h = await recordConnectorSyncResult(req.params['tenantId'], connectorId, { success, lagMs });
      res.json({ success: true, data: h });
    } catch (err) { next(err); }
  },
);

// ─── Connector contract changes ───────────────────────────────────────────────

observabilityAdminRouter.get(
  '/contract-changes',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const filter: ContractChangeFilter = {
        connectorId: req.query['connectorId'] as string | undefined,
        minImpactScore: req.query['minImpactScore'] !== undefined
          ? Number(req.query['minImpactScore']) as ContractChangeFilter['minImpactScore']
          : undefined,
        limit: req.query['limit'] !== undefined ? Number(req.query['limit']) : undefined,
      };
      const changes = await listContractChanges(filter);
      res.json({ success: true, data: changes });
    } catch (err) { next(err); }
  },
);

observabilityAdminRouter.post(
  '/contract-changes/detect',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const { connectorId, fields, schemaVersion, affectedTenantCount } = req.body as {
        connectorId: string;
        fields: Array<{ path: string; type: string; required: boolean; format?: string; enumValues?: string[] }>;
        schemaVersion?: string;
        affectedTenantCount?: number;
      };
      if (!connectorId || !Array.isArray(fields)) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'connectorId and fields required' } });
      }
      const changes = contractRegistry.detectChanges(connectorId, fields, { schemaVersion, affectedTenantCount });
      for (const c of changes) await saveContractChange(c);
      res.json({ success: true, data: { detected: changes.length, changes } });
    } catch (err) { next(err); }
  },
);

// ─── Connector contract baselines ─────────────────────────────────────────────

observabilityAdminRouter.get(
  '/contract-baselines/:connectorId',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const b = await getContractBaseline(req.params['connectorId']);
      if (!b) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No baseline registered' } });
      res.json({ success: true, data: b });
    } catch (err) { next(err); }
  },
);

observabilityAdminRouter.post(
  '/contract-baselines',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const { connectorId, schemaVersion, fields } = req.body as {
        connectorId: string; schemaVersion: string;
        fields: Array<{ path: string; type: string; required: boolean; format?: string; enumValues?: string[] }>;
      };
      if (!connectorId || !schemaVersion || !Array.isArray(fields)) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'connectorId, schemaVersion and fields required' } });
      }
      const baseline = { connectorId, schemaVersion, fields, registeredAt: new Date() };
      contractRegistry.registerBaseline(baseline);
      await upsertContractBaseline(baseline);
      res.status(201).json({ success: true, data: baseline });
    } catch (err) { next(err); }
  },
);

// ─── Consistency timeline (admin-safe) ───────────────────────────────────────

observabilityAdminRouter.get(
  '/timeline',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const tenantId = req.query['tenantId'] as string | undefined;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'tenantId required' } });
      }
      const kind = req.query['kind'] as string | undefined;
      const limit = req.query['limit'] !== undefined ? Number(req.query['limit']) : 100;
      const after = req.query['after'] as string | undefined;
      const entries = await consistencyTimeline.listAdminSafe(tenantId, {
        kind: kind as any,
        limit,
        after,
      });
      res.json({ success: true, data: entries });
    } catch (err) { next(err); }
  },
);

observabilityAdminRouter.get(
  '/timeline/summary',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const tenantId = req.query['tenantId'] as string | undefined;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'tenantId required' } });
      }
      const from = req.query['from'] ? new Date(req.query['from'] as string) : undefined;
      const to = req.query['to'] ? new Date(req.query['to'] as string) : undefined;
      const summary = await consistencyTimeline.summarize(tenantId, { from, to });
      res.json({ success: true, data: summary });
    } catch (err) { next(err); }
  },
);

observabilityAdminRouter.get(
  '/timeline/platform',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const tenantsParam = req.query['tenants'] as string | undefined;
      if (!tenantsParam) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'tenants (comma-separated) required' } });
      }
      const tenantIds = tenantsParam.split(',').map(s => s.trim()).filter(Boolean);
      const from = req.query['from'] ? new Date(req.query['from'] as string) : undefined;
      const to = req.query['to'] ? new Date(req.query['to'] as string) : undefined;
      const summary = await consistencyTimeline.platformSummary(tenantIds, { from, to });
      res.json({ success: true, data: summary });
    } catch (err) { next(err); }
  },
);

// ─── Runtime status (queue/job metadata — no payload) ────────────────────────

observabilityAdminRouter.get(
  '/runtime-status',
  requireAuth, requireRole('platform_admin'),
  async (_req, res, next) => {
    try {
      const allHealth = await listTenantSyncHealth();
      const totalConnectors = allHealth.reduce((s, h) => s + h.connectors.length, 0);
      const failingConnectors = allHealth.reduce(
        (s, h) => s + h.connectors.filter(c => c.status === 'failing').length, 0,
      );
      const degradedConnectors = allHealth.reduce(
        (s, h) => s + h.connectors.filter(c => c.status === 'degraded').length, 0,
      );
      const criticalTenants = allHealth.filter(h => h.criticalityTier === 'critical').length;
      const totalOpenCases = allHealth.reduce((s, h) => s + h.openCaseCount, 0);
      const totalSignals24h = allHealth.reduce((s, h) => s + h.signalCount24h, 0);

      res.json({
        success: true,
        data: {
          monitoredTenants: allHealth.length,
          criticalTenants,
          connectors: { total: totalConnectors, failing: failingConnectors, degraded: degradedConnectors },
          openCases: totalOpenCases,
          signals24h: totalSignals24h,
          evaluatedAt: new Date().toISOString(),
        },
      });
    } catch (err) { next(err); }
  },
);
