import type {
  TenantSyncHealth,
  ConnectorHealthSnapshot,
  ConnectorHealthStatus,
  CriticalityTier,
  SyncHealthUpdateOptions,
} from './types.js';

function deriveCriticality(h: TenantSyncHealth): CriticalityTier {
  const failing = h.connectors.filter(c => c.status === 'failing').length;
  if (failing > 0 || h.openCaseCount >= 10 || h.driftDetectedFlag) return 'critical';
  const degraded = h.connectors.filter(c => c.status === 'degraded').length;
  if (degraded > 0 || h.openCaseCount >= 5 || h.mappingValidityScore < 0.5) return 'high';
  if (h.openCaseCount >= 2 || h.mappingValidityScore < 0.75 || h.reconciliationBacklog > 100) return 'medium';
  return 'low';
}

/**
 * In-memory TenantSyncHealthService.
 *
 * Aggregates operational health per tenant from connector sync results,
 * open case counts, and pipeline metrics. Metadata only — no payload values.
 */
export class TenantSyncHealthService {
  private readonly store = new Map<string, TenantSyncHealth>();

  /** Upsert health record for a tenant, merging connector snapshots by connectorId. */
  upsert(tenantId: string, opts: SyncHealthUpdateOptions): TenantSyncHealth {
    const existing = this.store.get(tenantId);
    const base: TenantSyncHealth = existing ?? {
      tenantId,
      evaluatedAt: new Date(),
      connectors: [],
      mappingValidityScore: 1.0,
      reconciliationBacklog: 0,
      driftDetectedFlag: false,
      activeBehaviorProfile: null,
      criticalityTier: 'low',
      openCaseCount: 0,
      signalCount24h: 0,
    };

    if (opts.connectors) {
      for (const patch of opts.connectors) {
        if (!patch.connectorId) continue;
        const idx = base.connectors.findIndex(c => c.connectorId === patch.connectorId);
        if (idx >= 0) {
          base.connectors[idx] = { ...base.connectors[idx], ...patch } as ConnectorHealthSnapshot;
        } else {
          base.connectors.push({
            connectorId: patch.connectorId,
            status: patch.status ?? 'unknown',
            lastSuccessfulSyncAt: patch.lastSuccessfulSyncAt ?? null,
            lastSyncAttemptAt: patch.lastSyncAttemptAt ?? null,
            consecutiveFailures: patch.consecutiveFailures ?? 0,
            pipelineLagMs: patch.pipelineLagMs ?? null,
          });
        }
      }
    }

    if (opts.mappingValidityScore !== undefined) base.mappingValidityScore = opts.mappingValidityScore;
    if (opts.reconciliationBacklog !== undefined) base.reconciliationBacklog = opts.reconciliationBacklog;
    if (opts.driftDetectedFlag !== undefined) base.driftDetectedFlag = opts.driftDetectedFlag;
    if (opts.activeBehaviorProfile !== undefined) base.activeBehaviorProfile = opts.activeBehaviorProfile;
    if (opts.openCaseCount !== undefined) base.openCaseCount = opts.openCaseCount;
    if (opts.signalCount24h !== undefined) base.signalCount24h = opts.signalCount24h;

    base.evaluatedAt = new Date();
    base.criticalityTier = deriveCriticality(base);

    this.store.set(tenantId, base);
    return { ...base, connectors: base.connectors.map(c => ({ ...c })) };
  }

  /** Record a sync result for a specific connector. */
  recordSyncResult(
    tenantId: string,
    connectorId: string,
    result: { success: boolean; lagMs?: number },
  ): void {
    const h = this.store.get(tenantId);
    const prev = h?.connectors.find(c => c.connectorId === connectorId);
    const consecutiveFailures = result.success ? 0 : (prev?.consecutiveFailures ?? 0) + 1;
    const status: ConnectorHealthStatus =
      result.success ? 'healthy' :
      consecutiveFailures >= 5 ? 'failing' :
      consecutiveFailures >= 2 ? 'degraded' : 'degraded';

    this.upsert(tenantId, {
      connectors: [{
        connectorId,
        status,
        lastSyncAttemptAt: new Date(),
        lastSuccessfulSyncAt: result.success ? new Date() : (prev?.lastSuccessfulSyncAt ?? null),
        consecutiveFailures,
        pipelineLagMs: result.lagMs ?? null,
      }],
    });
  }

  get(tenantId: string): TenantSyncHealth | null {
    const h = this.store.get(tenantId);
    if (!h) return null;
    return { ...h, connectors: h.connectors.map(c => ({ ...c })) };
  }

  list(): TenantSyncHealth[] {
    return [...this.store.values()].map(h => ({
      ...h,
      connectors: h.connectors.map(c => ({ ...c })),
    }));
  }

  /** Return tenants at or above the given criticality tier. */
  listByCriticality(tier: CriticalityTier): TenantSyncHealth[] {
    const order: CriticalityTier[] = ['low', 'medium', 'high', 'critical'];
    const minIdx = order.indexOf(tier);
    return this.list().filter(h => order.indexOf(h.criticalityTier) >= minIdx);
  }
}
