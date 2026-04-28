import type { TrustScore, TrustUpdateEvent } from './types.js';

const INITIAL_SCORE = 0.5;
const LEARNING_RATE = 0.05;
const CORRECTION_PENALTY = 0.10;

/**
 * Adaptive trust scoring.
 * Scores are per (tenantId, connectorId, entityType?).
 * They are updated in-place based on outcome feedback and can be persisted externally.
 */
export class ConnectorTrustEngine {
  private readonly scores = new Map<string, TrustScore>();

  private key(tenantId: string, connectorId: string, entityType?: string): string {
    return `${tenantId}::${connectorId}::${entityType ?? '*'}`;
  }

  private getOrCreate(tenantId: string, connectorId: string, entityType?: string): TrustScore {
    const k = this.key(tenantId, connectorId, entityType);
    if (!this.scores.has(k)) {
      this.scores.set(k, {
        connectorId,
        tenantId,
        entityType,
        score: INITIAL_SCORE,
        acceptedCount: 0,
        rejectedCount: 0,
        correctionCount: 0,
        lastUpdated: new Date(),
      });
    }
    return this.scores.get(k)!;
  }

  record(event: TrustUpdateEvent): TrustScore {
    const s = this.getOrCreate(event.tenantId, event.connectorId, event.entityType);

    if (event.outcome === 'accepted') {
      s.score = Math.min(1, s.score + LEARNING_RATE);
      s.acceptedCount++;
    } else if (event.outcome === 'rejected') {
      s.score = Math.max(0, s.score - LEARNING_RATE);
      s.rejectedCount++;
    } else {
      s.score = Math.max(0, s.score - CORRECTION_PENALTY);
      s.correctionCount++;
    }
    s.lastUpdated = new Date();
    return { ...s };
  }

  get(tenantId: string, connectorId: string, entityType?: string): TrustScore {
    return { ...this.getOrCreate(tenantId, connectorId, entityType) };
  }

  listForTenant(tenantId: string): TrustScore[] {
    return [...this.scores.values()]
      .filter(s => s.tenantId === tenantId)
      .map(s => ({ ...s }));
  }

  loadSnapshot(scores: TrustScore[]): void {
    for (const s of scores) {
      this.scores.set(this.key(s.tenantId, s.connectorId, s.entityType), { ...s });
    }
  }
}
