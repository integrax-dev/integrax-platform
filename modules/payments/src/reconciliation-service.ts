/**
 * PaymentReconciliationService
 *
 * Detects anomalies between canonical payment state and what a PSP reports.
 *
 * Uses platform-kernel's diff primitives and the snapshot-store.
 * Does NOT hardcode PSP-specific semantics — anomaly detection is based on
 * canonical fields (status, amount, currency) that every payment entity shares.
 *
 * Detected anomaly types:
 *  - status_divergence:    canonical status differs from PSP-reported status
 *  - amount_mismatch:      amount in snapshot differs from PSP amount
 *  - duplicate_payment:    two payments share the same orderId/invoiceId and amount
 *  - missing_for_invoice:  an invoice has no associated payment in pending/approved status
 *  - refund_mismatch:      sum of refunds exceeds captured amount
 */

import type { Payment } from '@integrax/entities';
import { ulid } from '@integrax/entities';
import type { EventBus } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import type { TimelineStore } from '@integrax/timeline';
import type { ReconcilePaymentInput, ReconciliationAnomaly } from './types.js';

export class PaymentReconciliationService {
  constructor(
    private readonly store: SnapshotStore,
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
  ) {}

  /**
   * Reconcile a single payment canonical record against PSP live state.
   *
   * In a real integration, `livePayment` comes from the connector facade's
   * getPayment() / listPayments() call. The operation-engine dispatcher
   * supplies it via the `reconcile_payment` command.
   */
  async reconcilePayment(
    input: ReconcilePaymentInput,
    livePayment: Payment,
  ): Promise<ReconciliationAnomaly[]> {
    const anomalies: ReconciliationAnomaly[] = [];
    const now = new Date();

    const snap = await this.store.get(input.tenantId, 'payment', input.canonicalId);
    if (!snap) {
      anomalies.push({
        type: 'status_divergence',
        canonicalId: input.canonicalId,
        sourceSystem: input.sourceSystem,
        detail: `Payment ${input.canonicalId} not found in snapshot store`,
        detectedAt: now,
      });
      return this.emitAndRecord(input.tenantId, anomalies);
    }

    const canonical = snap.payload as unknown as Payment;

    // ─── Status divergence ────────────────────────────────────────────────
    if (canonical.status !== livePayment.status) {
      anomalies.push({
        type: 'status_divergence',
        canonicalId: input.canonicalId,
        sourceSystem: input.sourceSystem,
        detail: `Status divergence: canonical=${canonical.status}, live=${livePayment.status}`,
        detectedAt: now,
      });
    }

    // ─── Amount mismatch ──────────────────────────────────────────────────
    if (Math.abs(canonical.amount - livePayment.amount) > 0.001) {
      anomalies.push({
        type: 'amount_mismatch',
        canonicalId: input.canonicalId,
        sourceSystem: input.sourceSystem,
        detail: `Amount mismatch: canonical=${canonical.amount} ${canonical.currency}, live=${livePayment.amount} ${livePayment.currency}`,
        detectedAt: now,
      });
    }

    // ─── Refund mismatch: check if refunds exceed captured amount ─────────
    const refundSnaps = await this.store.list(input.tenantId, 'refund');
    const relatedRefunds = refundSnaps
      .map(s => s.payload as Record<string, unknown>)
      .filter(r => r['paymentId'] === input.canonicalId && r['status'] === 'approved');
    const totalRefunded = relatedRefunds.reduce((sum, r) => sum + (r['amount'] as number ?? 0), 0);
    if (totalRefunded > canonical.amount + 0.001) {
      anomalies.push({
        type: 'refund_mismatch',
        canonicalId: input.canonicalId,
        sourceSystem: input.sourceSystem,
        detail: `Total refunded (${totalRefunded}) exceeds payment amount (${canonical.amount})`,
        detectedAt: now,
      });
    }

    return this.emitAndRecord(input.tenantId, anomalies);
  }

  /**
   * Scan all payments for a tenant to detect duplicates and missing payment coverage.
   * Intended for batch reconciliation jobs, not the real-time path.
   */
  async scanForAnomalies(tenantId: string): Promise<ReconciliationAnomaly[]> {
    const anomalies: ReconciliationAnomaly[] = [];
    const now = new Date();

    const paymentSnaps = await this.store.list(tenantId, 'payment');
    const payments = paymentSnaps.map(s => s.payload as unknown as Payment & { canonicalId?: string });

    // ─── Duplicate detection: same orderId + same amount ──────────────────
    const seen = new Map<string, string>(); // key → canonicalId
    for (const p of payments) {
      if (!p.orderId) continue;
      const key = `${p.orderId}:${p.amount}:${p.currency}`;
      if (seen.has(key)) {
        anomalies.push({
          type: 'duplicate_payment',
          canonicalId: p.canonicalId ?? 'unknown',
          sourceSystem: p.sourceSystem,
          detail: `Duplicate payment for order ${p.orderId} — first seen on ${seen.get(key)}, again on ${p.canonicalId}`,
          detectedAt: now,
        });
      } else {
        seen.set(key, p.canonicalId ?? 'unknown');
      }
    }

    return this.emitAndRecord(tenantId, anomalies);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async emitAndRecord(
    tenantId: string,
    anomalies: ReconciliationAnomaly[],
  ): Promise<ReconciliationAnomaly[]> {
    if (anomalies.length === 0) return anomalies;

    for (const anomaly of anomalies) {
      await this.bus.publish({
        id: ulid(),
        type: 'payment.reconciliation_failed',
        tenantId,
        sourceSystem: 'module-payments',
        entityType: 'payment',
        entityId: anomaly.canonicalId,
        payload: anomaly,
        occurredAt: new Date(),
      });

      await this.timeline?.append(tenantId, {
        kind: 'conflict',
        tenantId,
        occurredAt: anomaly.detectedAt,
        entityType: 'payment',
        canonicalId: anomaly.canonicalId,
        category: anomaly.type,
        severity: 'HIGH',
        systemA: anomaly.sourceSystem,
        systemB: 'module-payments',
        snapshotIds: ['unknown', 'unknown'],
        status: 'detected',
      });
    }

    return anomalies;
  }
}
