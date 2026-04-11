import type { SnapshotStore, EntitySnapshot } from '@integrax/snapshot-store';
import type { EventBus, IntegraxEvent } from '@integrax/event-bus';
import { compareEntities } from '@integrax/platform-kernel';
import { ulid } from '@integrax/entities';
import type { TimelineStore } from '@integrax/timeline';
import type { Severity } from '@integrax/platform-kernel';
import type {
  ConsistencyInspector,
  ConsistencyIssue,
  ConsistencyReport,
  InspectionFilter,
  InspectionIssueKind,
} from './types.js';

const SUPPORTED_ENTITY_TYPES = [
  'product',
  'order',
  'invoice',
  'customer',
  'stock',
  'shipment',
] as const;

/**
 * Inspector de consistencia guiado por snapshots.
 *
 * Algoritmo por tipo de entidad:
 *  1. Carga todos los snapshots desde el snapshot store (uno por sistema origen).
 *  2. Compara cada par de snapshots usando `compareEntities` de platform-kernel.
 *  3. Traduce conflictos genericos a objetos `ConsistencyIssue` mas amigables para UI.
 *  4. Emite un evento `conflict.detected` por cada issue encontrado.
 *  5. Devuelve un `ConsistencyReport`.
 */
export class SnapshotConsistencyInspector implements ConsistencyInspector {
  constructor(
    private readonly store: SnapshotStore,
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
  ) {}

  async inspect(tenantId: string, entityType: string): Promise<ConsistencyReport> {
    const inspectedAt = new Date();
    const snapshots = await this.store.list(tenantId, entityType);
    const issues: ConsistencyIssue[] = [];

    // Agrupa por canonicalId.
    const byCanonical = new Map<string, EntitySnapshot[]>();
    for (const snap of snapshots) {
      const group = byCanonical.get(snap.canonicalId) ?? [];
      group.push(snap);
      byCanonical.set(snap.canonicalId, group);
    }

    for (const [canonicalId, group] of byCanonical) {
      // Compara todos los pares posibles.
      // Deduplicamos por campo: si 3 sistemas divergen en "price", emitimos
      // una sola issue por campo (la del par con mayor severidad), no N*(N-1)/2.
      const worstByField = new Map<string, {
        severity: import('@integrax/platform-kernel').Severity;
        systemA: string; systemB: string;
        valueA: unknown; valueB: unknown;
      }>();

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          const result = compareEntities(a.payload, b.payload);

          for (const conflict of result.conflicts) {
            const field = conflict.field ?? '__no_field__';
            const existing = worstByField.get(field);
            const severityOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
            const newIdx = severityOrder.indexOf(conflict.severity);
            const existIdx = existing ? severityOrder.indexOf(existing.severity) : -1;
            if (!existing || newIdx > existIdx) {
              worstByField.set(field, {
                severity: conflict.severity,
                systemA: a.sourceSystem,
                systemB: b.sourceSystem,
                valueA: conflict.valueA,
                valueB: conflict.valueB,
              });
            }
          }
        }
      }

      for (const [field, worst] of worstByField) {
        const issue = this.toIssue(
          entityType,
          canonicalId,
          worst.systemA,
          worst.systemB,
          field === '__no_field__' ? undefined : field,
          worst.valueA,
          worst.valueB,
          worst.severity,
        );
        issues.push(issue);
        await this.emitConflictEvent(tenantId, entityType, canonicalId, issue);
      }

      // Validaciones especificas por tipo de entidad.
      const specific = this.entitySpecificChecks(entityType, canonicalId, group);
      for (const issue of specific) {
        issues.push(issue);
        await this.emitConflictEvent(tenantId, entityType, canonicalId, issue);
      }
    }

    return this.buildReport(tenantId, entityType, inspectedAt, issues);
  }

  async inspectAll(tenantId: string, filter: InspectionFilter = {}): Promise<ConsistencyReport[]> {
    const types = filter.entityTypes ?? [...SUPPORTED_ENTITY_TYPES];
    const reports = await Promise.all(types.map(t => this.inspect(tenantId, t)));
    if (filter.severity) {
      return reports.map(r => ({
        ...r,
        issues: r.issues.filter(i => filter.severity!.includes(i.severity)),
      }));
    }
    return reports;
  }

  // --- Interno --------------------------------------------------------------

  private toIssue(
    entityType: string,
    canonicalId: string,
    systemA: string,
    systemB: string,
    field: string | undefined,
    valueA: unknown,
    valueB: unknown,
    severity: Severity,
  ): ConsistencyIssue {
    const kind = this.inferKind(entityType, field);
    return {
      kind,
      category: severityToCategory(severity, kind),
      severity,
      entityType,
      canonicalId,
      systemA,
      systemB,
      valueA,
      valueB,
      description: field
        ? `El campo '${field}' difiere entre ${systemA} (${JSON.stringify(valueA)}) y ${systemB} (${JSON.stringify(valueB)})`
        : `Se detecto una divergencia entre ${systemA} y ${systemB}`,
      detectedAt: new Date(),
    };
  }

  private inferKind(entityType: string, field?: string): InspectionIssueKind {
    if (!field) return 'state_mismatch';
    if (field === 'stock' || field === 'quantity') return 'stock_divergence';
    if (field === 'price' || field === 'amountTotal') return 'price_divergence';
    if (field === 'status') return 'state_mismatch';
    if (entityType === 'invoice') return 'invoice_missing';
    if (entityType === 'customer') return 'duplicate_customer';
    if (entityType === 'shipment') return 'shipment_orphaned';
    return 'state_mismatch';
  }

  private entitySpecificChecks(
    entityType: string,
    canonicalId: string,
    snapshots: EntitySnapshot[],
  ): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    // Factura: si solo un origen tiene snapshot, podria faltar en otro sistema.
    if (entityType === 'invoice' && snapshots.length === 1) {
      issues.push({
        kind: 'invoice_missing',
        category: 'policy_violation',
        severity: 'HIGH',
        entityType,
        canonicalId,
        systemA: snapshots[0].sourceSystem,
        description: `La factura ${canonicalId} solo aparece en ${snapshots[0].sourceSystem}; falta en los demas sistemas conectados`,
        detectedAt: new Date(),
      });
    }

    // Envio: si no hay referencia a pedido, se considera huerfano.
    if (entityType === 'shipment' && snapshots.length > 0) {
      const hasOrderRef = snapshots.some(
        s => s.payload['orderIds'] != null || s.payload['orderId'] != null,
      );
      if (!hasOrderRef) {
        issues.push({
          kind: 'shipment_orphaned',
          category: 'policy_violation',
          severity: 'MEDIUM',
          entityType,
          canonicalId,
          systemA: snapshots[0].sourceSystem,
          description: `El envio ${canonicalId} no tiene ningun ID de pedido vinculado`,
          detectedAt: new Date(),
        });
      }
    }

    return issues;
  }

  private async emitConflictEvent(
    tenantId: string,
    entityType: string,
    canonicalId: string,
    issue: ConsistencyIssue,
  ): Promise<void> {
    const event: IntegraxEvent<ConsistencyIssue> = {
      id: ulid(),
      type: 'conflict.detected',
      tenantId,
      sourceSystem: 'consistency-inspector',
      entityType,
      entityId: canonicalId,
      payload: issue,
      occurredAt: issue.detectedAt,
    };
    await this.bus.publish(event);

    await this.timeline?.append(tenantId, {
      kind: 'conflict',
      tenantId,
      occurredAt: issue.detectedAt,
      entityType,
      canonicalId,
      category: issue.category,
      severity: issue.severity,
      systemA: issue.systemA,
      systemB: issue.systemB ?? issue.systemA,
      snapshotIds: ['', ''] as [string, string], // populated when snapshot IDs are available
      status: 'detected',
    });
  }

  private buildReport(
    tenantId: string,
    entityType: string,
    inspectedAt: Date,
    issues: ConsistencyIssue[],
  ): ConsistencyReport {
    const bySeverity: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    const byKind: Partial<Record<string, number>> = {};
    for (const issue of issues) {
      bySeverity[issue.severity]++;
      byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1;
    }
    return {
      tenantId,
      entityType,
      inspectedAt,
      issues,
      summary: { total: issues.length, bySeverity, byKind },
    };
  }
}

function severityToCategory(
  severity: Severity,
  kind: InspectionIssueKind,
): import('@integrax/platform-kernel').ConflictCategory {
  if (kind === 'financial_conflict' || kind === 'price_divergence' || kind === 'invoice_missing') {
    return 'financial_conflict';
  }
  if (kind === 'state_mismatch') return 'state_divergence';
  if (kind === 'duplicate_customer') return 'duplicate_identity';
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'hard_drift';
  return 'soft_drift';
}
