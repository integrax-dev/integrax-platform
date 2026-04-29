import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTimelineStore } from '@integrax/timeline';
import { ConsistencyTimelineService } from './service.js';
import type { TimelineEntryInput } from '@integrax/timeline';

function entityInput(overrides: Partial<TimelineEntryInput> = {}): TimelineEntryInput {
  return {
    kind: 'entity',
    tenantId: 'ten1',
    occurredAt: new Date(),
    entityType: 'payment',
    canonicalId: 'pay_123',
    sourceSystem: 'mercadopago',
    deltas: [{ field: 'amount', before: 100, after: 110 }],
    previousHash: null,
    currentHash: 'abc123',
    actor: 'system',
    ...overrides,
  } as TimelineEntryInput;
}

function syncInput(overrides: Partial<TimelineEntryInput> = {}): TimelineEntryInput {
  return {
    kind: 'sync',
    tenantId: 'ten1',
    occurredAt: new Date(),
    sourceSystem: 'mercadopago',
    trigger: 'poll',
    entityType: 'payment',
    recordsFetched: 50,
    recordsChanged: 3,
    cursor: null,
    cursorAfter: 'cursor_1',
    durationMs: 200,
    ...overrides,
  } as TimelineEntryInput;
}

function policyInput(overrides: Partial<TimelineEntryInput> = {}): TimelineEntryInput {
  return {
    kind: 'policy_decision',
    tenantId: 'ten1',
    occurredAt: new Date(),
    entityType: 'payment',
    connectors: ['mercadopago', 'payway'],
    decisionMode: 'observe_only',
    propagationIntent: 'ignore',
    outcome: 'skipped',
    toleranceApplied: false,
    ...overrides,
  } as TimelineEntryInput;
}

let store: InMemoryTimelineStore;
let svc: ConsistencyTimelineService;

beforeEach(() => {
  store = new InMemoryTimelineStore();
  svc = new ConsistencyTimelineService(store);
});

// ─── listAdminSafe ────────────────────────────────────────────────────────────

describe('ConsistencyTimelineService — listAdminSafe', () => {
  it('strips deltas from EntityTrace and replaces with deltaCount', async () => {
    await store.append('ten1', entityInput());
    const entries = await svc.listAdminSafe('ten1');
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.kind).toBe('entity');
    expect('deltas' in e).toBe(false);
    expect((e as any).deltaCount).toBe(1);
  });

  it('passes SyncTrace through unchanged', async () => {
    await store.append('ten1', syncInput());
    const entries = await svc.listAdminSafe('ten1');
    expect(entries[0].kind).toBe('sync');
    expect('recordsFetched' in entries[0]).toBe(true);
  });

  it('passes PolicyDecisionTrace through unchanged', async () => {
    await store.append('ten1', policyInput());
    const entries = await svc.listAdminSafe('ten1');
    expect(entries[0].kind).toBe('policy_decision');
    expect('outcome' in entries[0]).toBe(true);
  });

  it('returns empty for unknown tenant', async () => {
    const entries = await svc.listAdminSafe('unknown');
    expect(entries).toHaveLength(0);
  });

  it('filters by kind', async () => {
    await store.append('ten1', entityInput());
    await store.append('ten1', syncInput());
    const entries = await svc.listAdminSafe('ten1', { kind: 'sync' });
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('sync');
  });

  it('never exposes before/after values in stripped entity entry', async () => {
    await store.append('ten1', entityInput({
      deltas: [
        { field: 'amount', before: 9999, after: 99999 },
        { field: 'currency', before: 'ARS', after: 'USD' },
      ],
    } as any));
    const entries = await svc.listAdminSafe('ten1');
    const raw = JSON.stringify(entries[0]);
    expect(raw).not.toContain('9999');
    expect(raw).not.toContain('ARS');
    expect(raw).not.toContain('USD');
    expect((entries[0] as any).deltaCount).toBe(2);
  });
});

// ─── summarize ────────────────────────────────────────────────────────────────

describe('ConsistencyTimelineService — summarize', () => {
  it('returns zero counts for an empty store', async () => {
    const summary = await svc.summarize('ten1');
    expect(summary.total).toBe(0);
    expect(summary.byKind.every(k => k.count === 0)).toBe(true);
  });

  it('counts entries by kind correctly', async () => {
    await store.append('ten1', entityInput());
    await store.append('ten1', entityInput());
    await store.append('ten1', syncInput());
    const summary = await svc.summarize('ten1', {
      from: new Date(Date.now() - 60_000),
      to: new Date(Date.now() + 60_000),
    });
    expect(summary.total).toBe(3);
    expect(summary.byKind.find(k => k.kind === 'entity')!.count).toBe(2);
    expect(summary.byKind.find(k => k.kind === 'sync')!.count).toBe(1);
  });

  it('includes latest timestamp per kind', async () => {
    await store.append('ten1', entityInput());
    const summary = await svc.summarize('ten1', {
      from: new Date(Date.now() - 60_000),
      to: new Date(Date.now() + 60_000),
    });
    const entitySlot = summary.byKind.find(k => k.kind === 'entity')!;
    expect(entitySlot.latest).toBeInstanceOf(Date);
  });

  it('isolates by tenantId', async () => {
    await store.append('ten1', entityInput());
    await store.append('ten2', syncInput({ tenantId: 'ten2' } as any));
    const s1 = await svc.summarize('ten1', { from: new Date(0), to: new Date(Date.now() + 60_000) });
    const s2 = await svc.summarize('ten2', { from: new Date(0), to: new Date(Date.now() + 60_000) });
    expect(s1.total).toBe(1);
    expect(s2.total).toBe(1);
  });
});

// ─── latestPerKind ────────────────────────────────────────────────────────────

describe('ConsistencyTimelineService — latestPerKind', () => {
  it('returns undefined for kinds with no entries', async () => {
    const latest = await svc.latestPerKind('ten1');
    expect(latest['entity']).toBeUndefined();
  });

  it('returns the most recent safe entry for each kind', async () => {
    await store.append('ten1', entityInput());
    await store.append('ten1', syncInput());
    const latest = await svc.latestPerKind('ten1');
    expect(latest['entity']?.kind).toBe('entity');
    expect(latest['sync']?.kind).toBe('sync');
    expect('deltas' in (latest['entity'] ?? {})).toBe(false);
  });
});

// ─── platformSummary ─────────────────────────────────────────────────────────

describe('ConsistencyTimelineService — platformSummary', () => {
  it('aggregates across multiple tenants', async () => {
    await store.append('ten1', entityInput());
    await store.append('ten2', entityInput({ tenantId: 'ten2' } as any));
    await store.append('ten2', syncInput({ tenantId: 'ten2' } as any));
    const summary = await svc.platformSummary(['ten1', 'ten2'], {
      from: new Date(Date.now() - 60_000),
      to: new Date(Date.now() + 60_000),
    });
    expect(summary.total).toBe(3);
    expect(summary.byKind['entity']).toBe(2);
    expect(summary.byKind['sync']).toBe(1);
  });
});
