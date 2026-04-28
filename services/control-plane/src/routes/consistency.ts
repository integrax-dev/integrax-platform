/**
 * Consistency Control Plane routes
 *
 * Admin endpoints (require platform_admin):
 *   GET    /api/admin/consistency/tolerance-policies
 *   POST   /api/admin/consistency/tolerance-policies
 *   DELETE /api/admin/consistency/tolerance-policies/:id
 *   GET    /api/admin/consistency/authority-rules
 *   POST   /api/admin/consistency/authority-rules
 *   DELETE /api/admin/consistency/authority-rules/:id
 *
 * Tenant endpoints (require operator+ for writes, viewer for reads):
 *   GET    /api/tenants/:tenantId/consistency/intents
 *   POST   /api/tenants/:tenantId/consistency/intents
 *   DELETE /api/tenants/:tenantId/consistency/intents/:id
 *   POST   /api/tenants/:tenantId/consistency/intents/compile
 *   GET    /api/tenants/:tenantId/consistency/signals
 *   POST   /api/tenants/:tenantId/consistency/signals
 *   GET    /api/tenants/:tenantId/consistency/cases
 *   GET    /api/tenants/:tenantId/consistency/cases/:caseId
 *   PATCH  /api/tenants/:tenantId/consistency/cases/:caseId
 *   GET    /api/tenants/:tenantId/consistency/cases/:caseId/timeline
 *   GET    /api/tenants/:tenantId/consistency/mappings
 *   POST   /api/tenants/:tenantId/consistency/mappings
 *   PATCH  /api/tenants/:tenantId/consistency/mappings/:id/transition
 *   GET    /api/tenants/:tenantId/consistency/trust
 *   POST   /api/tenants/:tenantId/consistency/trust/record
 *   GET    /api/tenants/:tenantId/consistency/profiles
 *   GET    /api/tenants/:tenantId/consistency/profiles/suggest
 */

import { Router } from 'express';
import { ulid } from 'ulid';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  toleranceRegistry,
  authorityRegistry,
  trustEngine,
  policyCompiler,
  signalService,
  mappingGovernance,
} from '../platform/container/consistency.js';
import {
  listTolerancePolicies, saveTolerancePolicy, deleteTolerancePolicy,
} from '../store/pg-tolerance-store.js';
import {
  listAuthorityRules, saveAuthorityRule, deleteAuthorityRule,
  listTrustScores, upsertTrustScore,
} from '../store/pg-authority-store.js';
import {
  listBehaviorIntents, saveBehaviorIntent, deleteBehaviorIntent,
} from '../store/pg-behavior-store.js';
import {
  saveSignal, listSignals, findRecentSignalByDedup,
  saveCase, getCase, listCases, saveTimelineEvent, getTimeline,
} from '../store/pg-signal-store.js';
import {
  listMappingRecords, saveMappingRecord, deleteMappingRecord,
} from '../store/pg-mapping-governance-store.js';
import {
  listProfiles, suggestBehaviorProfile,
} from '@integrax/behavior-engine';
import { computeDeduplicationKey, DEDUP_WINDOW_MS } from '@integrax/consistency-signals';
import { GovernanceViolationError } from '@integrax/mapping-governance';
import type { TolerancePolicy } from '@integrax/tolerance-engine';
import type { AuthorityRule } from '@integrax/authority-engine';
import type { IntentStatement } from '@integrax/behavior-engine';
import type { ConsistencySignal, CaseStatus } from '@integrax/consistency-signals';
import type { MappingRecord, TransitionEvent } from '@integrax/mapping-governance';

export const consistencyAdminRouter = Router();
export const consistencyTenantRouter = Router({ mergeParams: true });

// ─── Admin: tolerance policies ────────────────────────────────────────────────

consistencyAdminRouter.get(
  '/tolerance-policies',
  requireAuth, requireRole('platform_admin'),
  async (_req, res, next) => {
    try {
      const policies = await listTolerancePolicies();
      res.json({ success: true, data: policies });
    } catch (err) { next(err); }
  },
);

consistencyAdminRouter.post(
  '/tolerance-policies',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const policy: TolerancePolicy = {
        ...req.body,
        id: req.body.id ?? ulid(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await saveTolerancePolicy(policy);
      toleranceRegistry.register(policy);
      res.status(201).json({ success: true, data: policy });
    } catch (err) { next(err); }
  },
);

consistencyAdminRouter.delete(
  '/tolerance-policies/:id',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      await deleteTolerancePolicy(req.params['id']);
      toleranceRegistry.remove(req.params['id']);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

// ─── Admin: authority rules ───────────────────────────────────────────────────

consistencyAdminRouter.get(
  '/authority-rules',
  requireAuth, requireRole('platform_admin'),
  async (_req, res, next) => {
    try {
      const rules = await listAuthorityRules();
      res.json({ success: true, data: rules });
    } catch (err) { next(err); }
  },
);

consistencyAdminRouter.post(
  '/authority-rules',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      const rule: AuthorityRule = {
        ...req.body,
        id: req.body.id ?? ulid(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await saveAuthorityRule(rule);
      authorityRegistry.register(rule);
      res.status(201).json({ success: true, data: rule });
    } catch (err) { next(err); }
  },
);

consistencyAdminRouter.delete(
  '/authority-rules/:id',
  requireAuth, requireRole('platform_admin'),
  async (req, res, next) => {
    try {
      await deleteAuthorityRule(req.params['id']);
      authorityRegistry.remove(req.params['id']);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

// ─── Tenant: behavior intents ─────────────────────────────────────────────────

consistencyTenantRouter.get(
  '/intents',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const intents = await listBehaviorIntents(req.params['tenantId']);
      res.json({ success: true, data: intents });
    } catch (err) { next(err); }
  },
);

consistencyTenantRouter.post(
  '/intents',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const intent: IntentStatement = {
        ...req.body,
        id: req.body.id ?? ulid(),
        tenantId: req.params['tenantId'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await saveBehaviorIntent(intent);
      res.status(201).json({ success: true, data: intent });
    } catch (err) { next(err); }
  },
);

consistencyTenantRouter.delete(
  '/intents/:id',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      await deleteBehaviorIntent(req.params['id']);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

consistencyTenantRouter.post(
  '/intents/compile',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const tenantId = req.params['tenantId'];
      const intents = await listBehaviorIntents(tenantId);
      const profileId = req.body.profileId;
      const graph = policyCompiler.compile(tenantId, intents, profileId);
      res.json({ success: true, data: graph });
    } catch (err) { next(err); }
  },
);

// ─── Tenant: signals ──────────────────────────────────────────────────────────

consistencyTenantRouter.get(
  '/signals',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const tenantId = req.params['tenantId'];
      const signals = await listSignals(tenantId, {
        caseId: req.query['caseId'] as string | undefined,
        entityType: req.query['entityType'] as string | undefined,
      });
      res.json({ success: true, data: signals });
    } catch (err) { next(err); }
  },
);

consistencyTenantRouter.post(
  '/signals',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const tenantId = req.params['tenantId'];
      const body = req.body as Omit<ConsistencySignal, 'id' | 'tenantId' | 'deduplicationKey' | 'occurredAt'>;

      const deduplicationKey = computeDeduplicationKey({
        tenantId,
        kind: body.kind,
        entityType: body.entityType,
        entityId: body.entityId,
        fieldPath: body.fieldPath,
        connectorA: body.connectorA,
        connectorB: body.connectorB,
      });

      const existing = await findRecentSignalByDedup(deduplicationKey, DEDUP_WINDOW_MS);
      if (existing) {
        return res.status(200).json({ success: true, data: existing, isDuplicate: true });
      }

      const signal: ConsistencySignal = {
        ...body,
        id: ulid(),
        tenantId,
        deduplicationKey,
        occurredAt: new Date(),
        tags: body.tags ?? {},
      };

      const { signal: recorded } = signalService.recordSignal(signal);
      await saveSignal(recorded);

      if (recorded.caseId) {
        const caseObj = signalService.getCase(recorded.caseId);
        if (caseObj) await saveCase(caseObj);
        const timeline = signalService.getTimeline(recorded.caseId);
        for (const evt of timeline) await saveTimelineEvent(evt);
      }

      return res.status(201).json({ success: true, data: recorded, isDuplicate: false });
    } catch (err) { next(err); }
  },
);

// ─── Tenant: cases ────────────────────────────────────────────────────────────

consistencyTenantRouter.get(
  '/cases',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const cases = await listCases(req.params['tenantId'], {
        entityType: req.query['entityType'] as string | undefined,
        status: req.query['status'] as CaseStatus | undefined,
      });
      res.json({ success: true, data: cases });
    } catch (err) { next(err); }
  },
);

consistencyTenantRouter.get(
  '/cases/:caseId',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const c = await getCase(req.params['caseId']);
      if (!c) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } });
      return res.json({ success: true, data: c });
    } catch (err) { next(err); }
  },
);

consistencyTenantRouter.patch(
  '/cases/:caseId',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const { status, assignedTo } = req.body as { status?: CaseStatus; assignedTo?: string };
      const actor = req.user?.id ?? 'system';

      if (status) {
        const updated = signalService.updateCaseStatus(req.params['caseId'], status, actor);
        if (updated) await saveCase(updated);
      }
      if (assignedTo) {
        const updated = signalService.assignCase(req.params['caseId'], assignedTo);
        if (updated) await saveCase(updated);
      }

      const timeline = signalService.getTimeline(req.params['caseId']);
      for (const evt of timeline) await saveTimelineEvent(evt);

      const c = await getCase(req.params['caseId']);
      res.json({ success: true, data: c });
    } catch (err) { next(err); }
  },
);

consistencyTenantRouter.get(
  '/cases/:caseId/timeline',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const events = await getTimeline(req.params['caseId']);
      res.json({ success: true, data: events });
    } catch (err) { next(err); }
  },
);

// ─── Tenant: mapping governance ───────────────────────────────────────────────

consistencyTenantRouter.get(
  '/mappings',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const records = await listMappingRecords({
        tenantId: req.params['tenantId'],
        connectorAId: req.query['connectorA'] as string | undefined,
        connectorBId: req.query['connectorB'] as string | undefined,
        state: req.query['state'] as any,
      });
      res.json({ success: true, data: records });
    } catch (err) { next(err); }
  },
);

consistencyTenantRouter.post(
  '/mappings',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const record: MappingRecord = {
        ...req.body,
        id: req.body.id ?? ulid(),
        tenantId: req.params['tenantId'],
        state: req.body.state ?? 'candidate',
        acceptedCount: req.body.acceptedCount ?? 0,
        rejectedCount: req.body.rejectedCount ?? 0,
        correctionCount: req.body.correctionCount ?? 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mappingGovernance.register(record);
      await saveMappingRecord(record);
      res.status(201).json({ success: true, data: record });
    } catch (err) { next(err); }
  },
);

consistencyTenantRouter.patch(
  '/mappings/:id/transition',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const record = await import('../store/pg-mapping-governance-store.js').then(m => m.getMappingRecord(req.params['id']));
      if (!record) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Mapping not found' } });

      mappingGovernance.register(record);
      const event = req.body as TransitionEvent;
      const updated = mappingGovernance.transition(req.params['id'], event);
      await saveMappingRecord(updated);
      return res.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof GovernanceViolationError) {
        return res.status(422).json({
          success: false,
          error: { code: 'GOVERNANCE_VIOLATION', message: err.message },
        });
      }
      next(err);
    }
  },
);

// ─── Tenant: trust scores ─────────────────────────────────────────────────────

consistencyTenantRouter.get(
  '/trust',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const scores = await listTrustScores(req.params['tenantId']);
      res.json({ success: true, data: scores });
    } catch (err) { next(err); }
  },
);

consistencyTenantRouter.post(
  '/trust/record',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const { connectorId, entityType, outcome } = req.body as {
        connectorId: string;
        entityType?: string;
        outcome: 'accepted' | 'rejected' | 'corrected';
      };
      const tenantId = req.params['tenantId'];
      const updated = trustEngine.record({ connectorId, tenantId, entityType, outcome });
      await upsertTrustScore(ulid(), updated);
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
);

// ─── Tenant: behavior profiles ────────────────────────────────────────────────

consistencyTenantRouter.get(
  '/profiles',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  (_req, res) => {
    res.json({ success: true, data: listProfiles() });
  },
);

consistencyTenantRouter.get(
  '/profiles/suggest',
  requireAuth, requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  (req, res) => {
    const connectorIds = String(req.query['connectors'] ?? '').split(',').filter(Boolean);
    const entityTypes = String(req.query['entityTypes'] ?? '').split(',').filter(Boolean);
    const country = req.query['country'] as string | undefined;
    const suggestion = suggestBehaviorProfile({ connectorIds, entityTypes, country });
    res.json({ success: true, data: suggestion });
  },
);
