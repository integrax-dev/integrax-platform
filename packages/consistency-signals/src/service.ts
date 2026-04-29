import type {
  ConsistencySignal,
  ConsistencyCase,
  TimelineEvent,
  TimelineEventKind,
  CaseStatus,
  CaseType,
  SignalSeverity,
  SignalKind,
} from './types.js';
import { computeDeduplicationKey, DEDUP_WINDOW_MS } from './dedup.js';

function classifyCaseType(kind: SignalKind): CaseType {
  switch (kind) {
    case 'field_mismatch':
    case 'type_mismatch':
    case 'state_divergence':
      return 'STRICT_MISMATCH';
    case 'value_out_of_tolerance':
      return 'POLICY_VIOLATION';
    case 'authority_violation':
      return 'APPROVAL_REQUIRED';
    case 'propagation_lag':
      return 'PROPAGATION_BLOCKED';
    case 'field_missing':
    case 'identity_conflict':
      return 'MAPPING_UNCERTAINTY';
    case 'duplicate_detected':
      return 'CONNECTOR_FAILURE';
    case 'schema_drift':
      return 'SCHEMA_DRIFT';
    default:
      return 'STRICT_MISMATCH';
  }
}

function severityRank(s: SignalSeverity): number {
  return { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[s] ?? 0;
}

function maxSeverity(a: SignalSeverity, b: SignalSeverity): SignalSeverity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

/**
 * In-memory ConsistencySignalService.
 *
 * Responsibilities:
 *   - Deduplicate incoming signals within the dedup window
 *   - Auto-group signals into Cases by (tenantId, entityType, entityId)
 *   - Append timeline events on every state change
 *   - Never store or expose field values
 */
export class ConsistencySignalService {
  private readonly signals = new Map<string, ConsistencySignal>();
  private readonly cases = new Map<string, ConsistencyCase>();
  private readonly timeline: TimelineEvent[] = [];

  /** Dedup index: key → latest signal id */
  private readonly dedupIndex = new Map<string, { id: string; at: Date }>();

  recordSignal(signal: ConsistencySignal): { signal: ConsistencySignal; isDuplicate: boolean } {
    const key = computeDeduplicationKey({
      tenantId: signal.tenantId,
      kind: signal.kind,
      entityType: signal.entityType,
      entityId: signal.entityId,
      fieldPath: signal.fieldPath,
      connectorA: signal.connectorA,
      connectorB: signal.connectorB,
    });

    const existing = this.dedupIndex.get(key);
    if (existing) {
      const age = signal.occurredAt.getTime() - existing.at.getTime();
      if (age < DEDUP_WINDOW_MS) {
        return { signal: this.signals.get(existing.id)!, isDuplicate: true };
      }
    }

    const stored: ConsistencySignal = { ...signal, deduplicationKey: key };
    this.signals.set(signal.id, stored);
    this.dedupIndex.set(key, { id: signal.id, at: signal.occurredAt });

    const caseObj = this.getOrCreateCase(stored);
    if (!caseObj.signalIds.includes(signal.id)) {
      caseObj.signalIds.push(signal.id);
      caseObj.severity = maxSeverity(caseObj.severity, signal.severity);
      caseObj.updatedAt = new Date();
    }

    stored.caseId = caseObj.id;
    this.appendTimeline({
      caseId: caseObj.id,
      tenantId: signal.tenantId,
      kind: 'signal_added',
      description: `Signal '${signal.kind}' recorded for ${signal.entityType}${signal.fieldPath ? ` field '${signal.fieldPath}'` : ''}`,
      meta: { signalId: signal.id, kind: signal.kind, severity: signal.severity },
    });

    return { signal: stored, isDuplicate: false };
  }

  resolveSignal(signalId: string, resolvedBy: string): ConsistencySignal | undefined {
    const signal = this.signals.get(signalId);
    if (!signal) return undefined;
    signal.resolvedAt = new Date();
    return { ...signal };
  }

  updateCaseStatus(caseId: string, status: CaseStatus, actor?: string): ConsistencyCase | undefined {
    const c = this.cases.get(caseId);
    if (!c) return undefined;
    const prev = c.status;
    c.status = status;
    c.updatedAt = new Date();
    if (status === 'resolved') c.resolvedAt = new Date();

    this.appendTimeline({
      caseId,
      tenantId: c.tenantId,
      kind: 'case_status_changed',
      actor,
      description: `Case status changed from '${prev}' to '${status}'`,
      meta: { previousStatus: prev, newStatus: status },
    });
    return { ...c };
  }

  assignCase(caseId: string, userId: string): ConsistencyCase | undefined {
    const c = this.cases.get(caseId);
    if (!c) return undefined;
    c.assignedTo = userId;
    c.updatedAt = new Date();
    this.appendTimeline({
      caseId,
      tenantId: c.tenantId,
      kind: 'case_assigned',
      actor: userId,
      description: `Case assigned to ${userId}`,
      meta: { assignedTo: userId },
    });
    return { ...c };
  }

  getCase(caseId: string): ConsistencyCase | undefined {
    const c = this.cases.get(caseId);
    return c ? { ...c } : undefined;
  }

  listCases(tenantId: string, opts?: { entityType?: string; status?: CaseStatus }): ConsistencyCase[] {
    return [...this.cases.values()]
      .filter(c => c.tenantId === tenantId)
      .filter(c => !opts?.entityType || c.entityType === opts.entityType)
      .filter(c => !opts?.status || c.status === opts.status)
      .map(c => ({ ...c }));
  }

  listSignals(tenantId: string, opts?: { caseId?: string; entityType?: string }): ConsistencySignal[] {
    return [...this.signals.values()]
      .filter(s => s.tenantId === tenantId)
      .filter(s => !opts?.caseId || s.caseId === opts.caseId)
      .filter(s => !opts?.entityType || s.entityType === opts.entityType)
      .map(s => ({ ...s }));
  }

  getTimeline(caseId: string): TimelineEvent[] {
    return this.timeline.filter(e => e.caseId === caseId).map(e => ({ ...e }));
  }

  private getOrCreateCase(signal: ConsistencySignal): ConsistencyCase {
    let existing = [...this.cases.values()].find(
      c =>
        c.tenantId === signal.tenantId &&
        c.entityType === signal.entityType &&
        c.entityId === signal.entityId &&
        c.status !== 'resolved' &&
        c.status !== 'wont_fix',
    );

    if (!existing) {
      const id = `case_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      existing = {
        id,
        tenantId: signal.tenantId,
        entityType: signal.entityType,
        entityId: signal.entityId,
        title: `${signal.entityType} consistency issue${signal.entityId ? ` — ${signal.entityId}` : ''}`,
        caseType: classifyCaseType(signal.kind),
        status: 'open',
        severity: signal.severity,
        signalIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.cases.set(id, existing);
      this.appendTimeline({
        caseId: id,
        tenantId: signal.tenantId,
        kind: 'case_opened',
        description: `Case opened for ${signal.entityType}${signal.entityId ? ` (${signal.entityId})` : ''}`,
        meta: { entityType: signal.entityType, entityId: signal.entityId ?? '' },
      });
    }

    return existing;
  }

  private appendTimeline(opts: {
    caseId: string;
    tenantId: string;
    kind: TimelineEventKind;
    actor?: string;
    description: string;
    meta: Record<string, string | number | boolean>;
  }): void {
    const event: TimelineEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      caseId: opts.caseId,
      tenantId: opts.tenantId,
      kind: opts.kind,
      actor: opts.actor,
      description: opts.description,
      meta: opts.meta,
      occurredAt: new Date(),
      sensitive: false,
    };
    this.timeline.push(event);
  }
}
