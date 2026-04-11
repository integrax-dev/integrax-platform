import type { Invoice, InvoiceStatus } from '@integrax/entities';
import { ulid } from '@integrax/entities';
import type { EventBus } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import { hashPayload } from '@integrax/snapshot-store';
import { diffInvoices, evaluateInvoiceConflicts, invoiceRecommendation } from '@integrax/reconciliation-engine';
import type { CanonicalInvoice } from '@integrax/reconciliation-engine';
import type { TimelineStore } from '@integrax/timeline';
import type {
  BillingModule,
  CreateInvoiceInput,
  AuthorizeCaeInput,
  VoidInvoiceInput,
  CompareInvoicesInput,
  InvoiceComparisonResult,
} from './types.js';

export class BillingService implements BillingModule {
  constructor(
    private readonly store: SnapshotStore,
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
  ) {}

  async createInvoice(input: CreateInvoiceInput): Promise<Invoice & { id: string }> {
    const id = ulid();
    const now = new Date();
    const invoice: Invoice & { id: string } = {
      ...input.invoice,
      id,
      updatedAt: now,
      sourceSystem: input.sourceSystem,
    };

    const payloadHash = hashPayload(invoice as unknown as Record<string, unknown>);
    await this.store.upsert({
      snapshotId: ulid(),
      tenantId: input.tenantId,
      entityType: 'invoice',
      canonicalId: id,
      externalIds: invoice.externalIds,
      payloadHash,
      payload: invoice as unknown as Record<string, unknown>,
      sourceSystem: input.sourceSystem,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(input.tenantId, {
      kind: 'entity',
      tenantId: input.tenantId,
      occurredAt: now,
      entityType: 'invoice',
      canonicalId: id,
      sourceSystem: input.sourceSystem,
      deltas: [],
      previousHash: null,
      currentHash: payloadHash,
      actor: 'system',
    });

    await this.bus.publish({
      id: ulid(),
      type: 'invoice.created',
      tenantId: input.tenantId,
      sourceSystem: input.sourceSystem,
      entityType: 'invoice',
      entityId: id,
      payload: invoice,
      occurredAt: now,
    });

    return invoice;
  }

  async authorizeCae(input: AuthorizeCaeInput): Promise<void> {
    const snap = await this.store.get(input.tenantId, 'invoice', input.canonicalId);
    if (!snap) throw new Error(`Invoice not found: ${input.canonicalId}`);
    const now = new Date();
    const updated = {
      ...snap.payload,
      cae: input.cae,
      caeExpiryDate: input.caeExpiryDate,
      status: 'authorized',
      updatedAt: now,
    };
    const newHash = hashPayload(updated);
    await this.store.upsert({
      ...snap,
      snapshotId: ulid(),
      payload: updated,
      payloadHash: newHash,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(input.tenantId, {
      kind: 'entity',
      tenantId: input.tenantId,
      occurredAt: now,
      entityType: 'invoice',
      canonicalId: input.canonicalId,
      sourceSystem: input.sourceSystem,
      deltas: [
        { field: 'cae', before: null, after: input.cae },
        { field: 'status', before: snap.payload['status'], after: 'authorized' },
      ],
      previousHash: snap.payloadHash,
      currentHash: newHash,
      actor: 'system',
    });

    await this.bus.publish({
      id: ulid(),
      type: 'invoice.authorized',
      tenantId: input.tenantId,
      sourceSystem: input.sourceSystem,
      entityType: 'invoice',
      entityId: input.canonicalId,
      payload: { canonicalId: input.canonicalId, cae: input.cae, expiryDate: input.caeExpiryDate },
      occurredAt: now,
    });
  }

  async voidInvoice(input: VoidInvoiceInput): Promise<void> {
    const snap = await this.store.get(input.tenantId, 'invoice', input.canonicalId);
    if (!snap) throw new Error(`Invoice not found: ${input.canonicalId}`);
    const now = new Date();
    const updated = { ...snap.payload, status: 'voided', updatedAt: now };
    const newHash = hashPayload(updated);
    await this.store.upsert({
      ...snap,
      snapshotId: ulid(),
      payload: updated,
      payloadHash: newHash,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(input.tenantId, {
      kind: 'entity',
      tenantId: input.tenantId,
      occurredAt: now,
      entityType: 'invoice',
      canonicalId: input.canonicalId,
      sourceSystem: input.sourceSystem,
      deltas: [{ field: 'status', before: snap.payload['status'], after: 'voided' }],
      previousHash: snap.payloadHash,
      currentHash: newHash,
      actor: 'system',
    });

    await this.bus.publish({
      id: ulid(),
      type: 'invoice.voided',
      tenantId: input.tenantId,
      sourceSystem: input.sourceSystem,
      entityType: 'invoice',
      entityId: input.canonicalId,
      payload: { canonicalId: input.canonicalId, reason: input.reason },
      occurredAt: now,
    });
  }

  async getInvoice(tenantId: string, canonicalId: string): Promise<Invoice | null> {
    const snap = await this.store.get(tenantId, 'invoice', canonicalId);
    return snap ? (snap.payload as unknown as Invoice) : null;
  }

  async listInvoices(
    tenantId: string,
    options: { status?: InvoiceStatus; since?: Date; limit?: number } = {},
  ): Promise<Invoice[]> {
    const snaps = await this.store.list(tenantId, 'invoice', { since: options.since, limit: options.limit });
    return snaps
      .map(s => s.payload as unknown as Invoice)
      .filter(inv => !options.status || inv.status === options.status);
  }

  async compareAcrossSystems(input: CompareInvoicesInput): Promise<InvoiceComparisonResult> {
    const snaps = await this.store.getAll(input.tenantId, 'invoice', input.canonicalId);
    if (snaps.length < 2) {
      return {
        canonicalId: input.canonicalId,
        systems: snaps.map(s => s.sourceSystem),
        hasConflicts: false,
        recommendation: 'PROCEED',
        conflicts: [],
      };
    }

    const [a, b] = snaps;
    const invoiceA = a.payload as unknown as CanonicalInvoice;
    const invoiceB = b.payload as unknown as CanonicalInvoice;
    const conflicts = diffInvoices(invoiceA, invoiceB);
    const evaluated = evaluateInvoiceConflicts(conflicts);
    const recommendation = invoiceRecommendation(evaluated) as InvoiceComparisonResult['recommendation'];

    return {
      canonicalId: input.canonicalId,
      systems: snaps.map(s => s.sourceSystem),
      hasConflicts: conflicts.length > 0,
      recommendation,
      conflicts: (evaluated as unknown as Array<{ conflict: { type: string; severity: string; summary: string } }>).map(e => ({
        type: e.conflict.type,
        severity: e.conflict.severity,
        summary: e.conflict.summary,
      })),
    };
  }
}
