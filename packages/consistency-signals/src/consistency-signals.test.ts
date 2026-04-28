import { describe, it, expect } from 'vitest';
import { ConsistencySignalService } from './service.js';
import { computeDeduplicationKey } from './dedup.js';
import type { ConsistencySignal } from './types.js';

function makeSignal(overrides: Partial<ConsistencySignal> = {}): ConsistencySignal {
  return {
    id: `sig_${Math.random().toString(36).slice(2)}`,
    tenantId: 'ten1',
    kind: 'field_mismatch',
    severity: 'HIGH',
    entityType: 'payment',
    entityId: 'pay_123',
    connectorA: 'mercadopago',
    connectorB: 'payway',
    fieldPath: 'transaction_amount',
    tags: {},
    deduplicationKey: '',
    occurredAt: new Date(),
    ...overrides,
  };
}

// ─── computeDeduplicationKey ──────────────────────────────────────────────────

describe('computeDeduplicationKey', () => {
  it('is deterministic', () => {
    const opts = { tenantId: 'ten1', kind: 'field_mismatch' as const, entityType: 'payment', entityId: 'p1', fieldPath: 'amount', connectorA: 'mp', connectorB: 'pw' };
    expect(computeDeduplicationKey(opts)).toBe(computeDeduplicationKey(opts));
  });

  it('connector order does not matter', () => {
    const base = { tenantId: 'ten1', kind: 'field_mismatch' as const, entityType: 'payment' };
    const k1 = computeDeduplicationKey({ ...base, connectorA: 'mp', connectorB: 'pw' });
    const k2 = computeDeduplicationKey({ ...base, connectorA: 'pw', connectorB: 'mp' });
    expect(k1).toBe(k2);
  });

  it('different fields produce different keys', () => {
    const base = { tenantId: 'ten1', kind: 'field_mismatch' as const, entityType: 'payment', connectorA: 'mp' };
    expect(computeDeduplicationKey({ ...base, fieldPath: 'amount' }))
      .not.toBe(computeDeduplicationKey({ ...base, fieldPath: 'currency' }));
  });
});

// ─── ConsistencySignalService ─────────────────────────────────────────────────

describe('ConsistencySignalService — signal recording', () => {
  it('records a signal and returns isDuplicate: false', () => {
    const svc = new ConsistencySignalService();
    const { isDuplicate } = svc.recordSignal(makeSignal());
    expect(isDuplicate).toBe(false);
  });

  it('deduplicates signals within the window', () => {
    const svc = new ConsistencySignalService();
    const signal = makeSignal();
    svc.recordSignal(signal);

    // Same logical signal, different id, within window
    const { isDuplicate } = svc.recordSignal({ ...signal, id: 'sig_copy' });
    expect(isDuplicate).toBe(true);
  });

  it('assigns a caseId to the recorded signal', () => {
    const svc = new ConsistencySignalService();
    const { signal } = svc.recordSignal(makeSignal());
    expect(signal.caseId).toBeDefined();
  });
});

describe('ConsistencySignalService — case management', () => {
  it('groups signals for the same entity into one case', () => {
    const svc = new ConsistencySignalService();
    svc.recordSignal(makeSignal({ id: 's1', fieldPath: 'amount' }));
    svc.recordSignal(makeSignal({ id: 's2', fieldPath: 'currency', kind: 'type_mismatch' }));
    const cases = svc.listCases('ten1');
    expect(cases).toHaveLength(1);
    expect(cases[0].signalIds).toHaveLength(2);
  });

  it('creates separate cases for different entities', () => {
    const svc = new ConsistencySignalService();
    svc.recordSignal(makeSignal({ id: 's1', entityId: 'pay_001' }));
    svc.recordSignal(makeSignal({ id: 's2', entityId: 'pay_002' }));
    expect(svc.listCases('ten1')).toHaveLength(2);
  });

  it('case status defaults to open', () => {
    const svc = new ConsistencySignalService();
    svc.recordSignal(makeSignal());
    expect(svc.listCases('ten1')[0].status).toBe('open');
  });

  it('updateCaseStatus changes status and appends timeline event', () => {
    const svc = new ConsistencySignalService();
    const { signal } = svc.recordSignal(makeSignal());
    const caseId = signal.caseId!;
    svc.updateCaseStatus(caseId, 'resolved', 'user1');
    expect(svc.getCase(caseId)?.status).toBe('resolved');
    const timeline = svc.getTimeline(caseId);
    expect(timeline.some(e => e.kind === 'case_status_changed')).toBe(true);
  });

  it('assignCase sets assignedTo and appends timeline event', () => {
    const svc = new ConsistencySignalService();
    const { signal } = svc.recordSignal(makeSignal());
    const caseId = signal.caseId!;
    svc.assignCase(caseId, 'user@company.com');
    expect(svc.getCase(caseId)?.assignedTo).toBe('user@company.com');
    const timeline = svc.getTimeline(caseId);
    expect(timeline.some(e => e.kind === 'case_assigned')).toBe(true);
  });

  it('case severity escalates to worst signal severity', () => {
    const svc = new ConsistencySignalService();
    svc.recordSignal(makeSignal({ id: 's1', severity: 'LOW',      entityId: 'pay_x', fieldPath: 'amount' }));
    svc.recordSignal(makeSignal({ id: 's2', severity: 'CRITICAL', entityId: 'pay_x', fieldPath: 'currency', kind: 'type_mismatch' }));
    expect(svc.listCases('ten1')[0].severity).toBe('CRITICAL');
  });
});

describe('ConsistencySignalService — timeline safety', () => {
  it('every timeline event has sensitive === false (structural literal)', () => {
    const svc = new ConsistencySignalService();
    const { signal } = svc.recordSignal(makeSignal());
    const timeline = svc.getTimeline(signal.caseId!);
    for (const evt of timeline) {
      expect(evt.sensitive).toBe(false);
      // TypeScript compile-time guarantee: evt.sensitive is typed as `false` (literal)
      const _typeCheck: false = evt.sensitive;
      void _typeCheck;
    }
  });

  it('timeline descriptions never contain field values from signal', () => {
    const svc = new ConsistencySignalService();
    const { signal } = svc.recordSignal(makeSignal({ fieldPath: 'amount' }));
    const timeline = svc.getTimeline(signal.caseId!);
    for (const evt of timeline) {
      // Descriptions may mention field paths but not values
      expect(evt.description).not.toMatch(/[0-9]{4,}/); // no large numeric values
    }
  });
});
