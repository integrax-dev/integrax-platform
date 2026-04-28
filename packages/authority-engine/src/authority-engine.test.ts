import { describe, it, expect } from 'vitest';
import { AuthorityRegistry } from './registry.js';
import { ConnectorTrustEngine } from './trust-engine.js';
import { suggestAuthority } from './suggester.js';
import type { AuthorityRule, TrustScore } from './types.js';

const base: AuthorityRule = {
  id: 'r1',
  mode: 'prefer_a',
  authorityConnector: 'mercadopago',
  priority: 0,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── AuthorityRegistry ────────────────────────────────────────────────────────

describe('AuthorityRegistry — default', () => {
  it('returns observe_only when no rules match', () => {
    const reg = new AuthorityRegistry();
    const r = reg.resolve({ tenantId: 'ten1' });
    expect(r.mode).toBe('observe_only');
    expect(r.source).toBe('default');
    expect(r.rule).toBeNull();
  });
});

describe('AuthorityRegistry — resolution', () => {
  it('returns matching rule and marks source as explicit_rule', () => {
    const reg = new AuthorityRegistry();
    reg.register({ ...base, id: 'r1', tenantId: 'ten1' });
    const r = reg.resolve({ tenantId: 'ten1' });
    expect(r.mode).toBe('prefer_a');
    expect(r.source).toBe('explicit_rule');
    expect(r.rule?.id).toBe('r1');
  });

  it('tenant-specific rule wins over platform default', () => {
    const reg = new AuthorityRegistry();
    reg.register({ ...base, id: 'platform', tenantId: undefined, mode: 'suggest', priority: 0 });
    reg.register({ ...base, id: 'tenant',   tenantId: 'ten1',    mode: 'prefer_a', priority: 0 });
    expect(reg.resolve({ tenantId: 'ten1' }).mode).toBe('prefer_a');
  });

  it('field-scoped rule beats entity-level rule', () => {
    const reg = new AuthorityRegistry();
    reg.register({ ...base, id: 'entity', tenantId: 'ten1', entityType: 'payment', mode: 'suggest' });
    reg.register({ ...base, id: 'field',  tenantId: 'ten1', entityType: 'payment', field: 'amount', mode: 'prefer_a' });
    expect(reg.resolve({ tenantId: 'ten1', entityType: 'payment', field: 'amount' }).mode).toBe('prefer_a');
  });

  it('different tenant rules do not apply', () => {
    const reg = new AuthorityRegistry();
    reg.register({ ...base, id: 'other', tenantId: 'ten2' });
    expect(reg.resolve({ tenantId: 'ten1' }).mode).toBe('observe_only');
  });

  it('disabled rule is skipped', () => {
    const reg = new AuthorityRegistry();
    reg.register({ ...base, id: 'off', tenantId: 'ten1', enabled: false, mode: 'auto_accept' });
    expect(reg.resolve({ tenantId: 'ten1' }).mode).toBe('observe_only');
  });

  it('connector-pair rule matches regardless of order', () => {
    const reg = new AuthorityRegistry();
    reg.register({ ...base, id: 'pair', tenantId: 'ten1', connectorPair: ['mercadopago', 'payway'] });
    expect(reg.resolve({ tenantId: 'ten1', connectorA: 'payway', connectorB: 'mercadopago' }).mode).toBe('prefer_a');
  });
});

// ─── ConnectorTrustEngine ─────────────────────────────────────────────────────

describe('ConnectorTrustEngine', () => {
  it('starts at 0.5', () => {
    const eng = new ConnectorTrustEngine();
    expect(eng.get('ten1', 'mp').score).toBe(0.5);
  });

  it('accepted outcome increases score', () => {
    const eng = new ConnectorTrustEngine();
    const s = eng.record({ tenantId: 'ten1', connectorId: 'mp', outcome: 'accepted' });
    expect(s.score).toBeGreaterThan(0.5);
  });

  it('rejected outcome decreases score', () => {
    const eng = new ConnectorTrustEngine();
    const s = eng.record({ tenantId: 'ten1', connectorId: 'mp', outcome: 'rejected' });
    expect(s.score).toBeLessThan(0.5);
  });

  it('corrected outcome decreases score more than rejected', () => {
    const eng1 = new ConnectorTrustEngine();
    const eng2 = new ConnectorTrustEngine();
    const afterReject   = eng1.record({ tenantId: 'ten1', connectorId: 'mp', outcome: 'rejected' });
    const afterCorrected = eng2.record({ tenantId: 'ten1', connectorId: 'mp', outcome: 'corrected' });
    expect(afterCorrected.score).toBeLessThan(afterReject.score);
  });

  it('score is clamped to [0, 1]', () => {
    const eng = new ConnectorTrustEngine();
    for (let i = 0; i < 100; i++) eng.record({ tenantId: 'ten1', connectorId: 'mp', outcome: 'rejected' });
    expect(eng.get('ten1', 'mp').score).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 100; i++) eng.record({ tenantId: 'ten1', connectorId: 'mp', outcome: 'accepted' });
    expect(eng.get('ten1', 'mp').score).toBeLessThanOrEqual(1);
  });

  it('counters accumulate correctly', () => {
    const eng = new ConnectorTrustEngine();
    eng.record({ tenantId: 'ten1', connectorId: 'mp', outcome: 'accepted' });
    eng.record({ tenantId: 'ten1', connectorId: 'mp', outcome: 'accepted' });
    eng.record({ tenantId: 'ten1', connectorId: 'mp', outcome: 'rejected' });
    const s = eng.get('ten1', 'mp');
    expect(s.acceptedCount).toBe(2);
    expect(s.rejectedCount).toBe(1);
  });

  it('entity-type scoping is independent', () => {
    const eng = new ConnectorTrustEngine();
    eng.record({ tenantId: 'ten1', connectorId: 'mp', entityType: 'payment', outcome: 'accepted' });
    expect(eng.get('ten1', 'mp', 'payment').acceptedCount).toBe(1);
    expect(eng.get('ten1', 'mp', 'invoice').acceptedCount).toBe(0);
  });
});

// ─── suggestAuthority ─────────────────────────────────────────────────────────

function makeScore(connectorId: string, score: number, accepted = 20, rejected = 0): TrustScore {
  return {
    connectorId, tenantId: 'ten1', score,
    acceptedCount: accepted, rejectedCount: rejected, correctionCount: 0,
    lastUpdated: new Date(),
  };
}

describe('suggestAuthority', () => {
  it('returns observe_only when sample count is below threshold', () => {
    const s = suggestAuthority(makeScore('mp', 0.9, 5, 0), makeScore('pw', 0.5, 5, 0));
    expect(s.suggestedMode).toBe('observe_only');
    expect(s.confidence).toBe(0);
  });

  it('requiresApproval is always true', () => {
    const s = suggestAuthority(makeScore('mp', 0.9), makeScore('pw', 0.5));
    expect(s.requiresApproval).toBe(true);
  });

  it('suggests auto_accept when one connector dominates strongly', () => {
    const s = suggestAuthority(makeScore('mp', 0.9), makeScore('pw', 0.6));
    expect(s.suggestedMode).toBe('auto_accept');
    expect(s.suggestedAuthorityConnector).toBe('mp');
  });

  it('suggests suggest when scores are close', () => {
    const s = suggestAuthority(makeScore('mp', 0.72), makeScore('pw', 0.70));
    expect(s.suggestedMode).toBe('suggest');
  });
});
