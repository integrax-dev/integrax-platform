import { describe, it, expect } from 'vitest';
import { MappingGovernanceEngine, GovernanceViolationError } from './engine.js';
import type { MappingRecord } from './types.js';

function makeRecord(overrides: Partial<MappingRecord> = {}): MappingRecord {
  return {
    id: 'map1',
    connectorAId: 'mercadopago',
    connectorBId: 'payway',
    sourcePath: 'transaction_amount',
    targetPath: 'amount',
    state: 'candidate',
    confidence: 0.85,
    acceptedCount: 0,
    rejectedCount: 0,
    correctionCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Allowed transitions ──────────────────────────────────────────────────────

describe('MappingGovernanceEngine — allowed transitions', () => {
  it('candidate → validated via validate event', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord());
    const updated = eng.transition('map1', { kind: 'validate', by: 'user1' });
    expect(updated.state).toBe('validated');
  });

  it('validated → trusted via trust event', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ state: 'validated' }));
    const updated = eng.transition('map1', { kind: 'trust', by: 'user1' });
    expect(updated.state).toBe('trusted');
  });

  it('trusted → ground_truth via promote_ground_truth event with approvedBy', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ state: 'trusted' }));
    const updated = eng.transition('map1', { kind: 'promote_ground_truth', by: 'admin', approvedBy: 'cto@company.com' });
    expect(updated.state).toBe('ground_truth');
    expect(updated.approvedBy).toBe('cto@company.com');
  });

  it('any state can transition to deprecated', () => {
    for (const state of ['candidate', 'validated', 'trusted', 'ground_truth'] as const) {
      const eng = new MappingGovernanceEngine();
      eng.register(makeRecord({ state }));
      const updated = eng.transition('map1', { kind: 'deprecate', by: 'admin', reason: 'obsolete' });
      expect(updated.state).toBe('deprecated');
    }
  });
});

// ─── Governance violations ────────────────────────────────────────────────────

describe('MappingGovernanceEngine — governance violations', () => {
  it('candidate cannot jump directly to ground_truth', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ state: 'candidate' }));
    expect(() =>
      eng.transition('map1', { kind: 'promote_ground_truth', by: 'admin', approvedBy: 'cto@company.com' }),
    ).toThrow(GovernanceViolationError);
  });

  it('candidate cannot skip to trusted', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ state: 'candidate' }));
    expect(() => eng.transition('map1', { kind: 'trust', by: 'user1' })).toThrow(GovernanceViolationError);
  });

  it('deprecated mapping cannot be re-promoted', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ state: 'deprecated' }));
    expect(() => eng.transition('map1', { kind: 'validate', by: 'user1' })).toThrow(GovernanceViolationError);
  });

  it('trusted → ground_truth without promote_ground_truth event throws', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ state: 'trusted' }));
    // validate event is only for candidate→validated; using it from trusted is an invalid transition
    expect(() => eng.transition('map1', { kind: 'validate', by: 'user1' })).toThrow(GovernanceViolationError);
  });

  it('GovernanceViolationError carries mapping id and states', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ state: 'candidate' }));
    try {
      eng.transition('map1', { kind: 'trust', by: 'user1' });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GovernanceViolationError);
      expect((e as GovernanceViolationError).mappingId).toBe('map1');
      expect((e as GovernanceViolationError).fromState).toBe('candidate');
    }
  });
});

// ─── Auto-promotion logic ─────────────────────────────────────────────────────

describe('MappingGovernanceEngine — auto-promotion', () => {
  it('candidate auto-promotes to validated after 5 accepted with 0 rejected', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord());
    for (let i = 0; i < 5; i++) eng.recordFeedback('map1', 'accepted');
    expect(eng.get('map1')?.state).toBe('validated');
  });

  it('candidate does NOT auto-promote to validated if there are rejections', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord());
    for (let i = 0; i < 4; i++) eng.recordFeedback('map1', 'accepted');
    eng.recordFeedback('map1', 'rejected');
    for (let i = 0; i < 5; i++) eng.recordFeedback('map1', 'accepted');
    expect(eng.get('map1')?.state).toBe('candidate');
  });

  it('validated auto-promotes to trusted after 20 accepted with 0 rejected', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ state: 'validated', acceptedCount: 19, rejectedCount: 0 }));
    eng.recordFeedback('map1', 'accepted');
    expect(eng.get('map1')?.state).toBe('trusted');
  });

  it('trusted is NEVER auto-promoted to ground_truth', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ state: 'trusted', acceptedCount: 999, rejectedCount: 0 }));
    for (let i = 0; i < 100; i++) eng.recordFeedback('map1', 'accepted');
    expect(eng.get('map1')?.state).toBe('trusted');
  });
});

// ─── List / filter ────────────────────────────────────────────────────────────

describe('MappingGovernanceEngine — list', () => {
  it('filters by state', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ id: 'a', state: 'candidate' }));
    eng.register(makeRecord({ id: 'b', state: 'validated' }));
    expect(eng.list({ state: 'candidate' }).length).toBe(1);
    expect(eng.list({ state: 'candidate' })[0].id).toBe('a');
  });

  it('filters by connector pair regardless of order', () => {
    const eng = new MappingGovernanceEngine();
    eng.register(makeRecord({ id: 'a', connectorAId: 'mp', connectorBId: 'pw' }));
    eng.register(makeRecord({ id: 'b', connectorAId: 'afip', connectorBId: 'contabilium' }));
    expect(eng.list({ connectorAId: 'pw', connectorBId: 'mp' }).length).toBe(1);
  });
});
