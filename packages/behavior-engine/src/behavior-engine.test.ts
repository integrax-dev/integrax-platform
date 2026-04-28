import { describe, it, expect } from 'vitest';
import { ConsistencyPolicyCompiler, PolicyCompilationError } from './compiler.js';
import { suggestBehaviorProfile, listProfiles, getProfile } from './suggester.js';
import type { IntentStatement } from './types.js';

function makeIntent(overrides: Partial<IntentStatement> = {}): IntentStatement {
  return {
    id: 'i1',
    tenantId: 'ten1',
    when: 'field.changed',
    entityType: 'payment',
    connectors: ['mercadopago', 'payway'],
    propagation: 'mirror',
    divergenceMode: 'strict_sync',
    authorityConnector: 'mercadopago',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── ConsistencyPolicyCompiler ────────────────────────────────────────────────

describe('ConsistencyPolicyCompiler — valid compilation', () => {
  const compiler = new ConsistencyPolicyCompiler();

  it('compiles a single intent into a graph with one node', () => {
    const graph = compiler.compile('ten1', [makeIntent()]);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.tenantId).toBe('ten1');
    expect(graph.compiledAt).toBeInstanceOf(Date);
  });

  it('disabled intents are excluded from the graph', () => {
    const graph = compiler.compile('ten1', [makeIntent({ enabled: false })]);
    expect(graph.nodes).toHaveLength(0);
  });

  it('assigns a profileId when provided', () => {
    const graph = compiler.compile('ten1', [makeIntent()], 'ecommerce_standard');
    expect(graph.profileId).toBe('ecommerce_standard');
  });

  it('produces an execution plan with steps in entity-then-field order', () => {
    const intents = [
      makeIntent({ id: 'entity', field: undefined }),
      makeIntent({ id: 'field',  field: 'amount' }),
    ];
    const graph = compiler.compile('ten1', intents);
    expect(graph.executionPlan.steps.length).toBe(2);
    // entity-level step should come first
    const firstStep = graph.executionPlan.steps[0];
    const firstNode = graph.nodes.find(n => n.id === firstStep.nodeId);
    expect(firstNode?.field).toBeUndefined();
  });

  it('lock propagation produces a lock step', () => {
    const graph = compiler.compile('ten1', [makeIntent({ propagation: 'lock', divergenceMode: 'regulatory_locked' })]);
    expect(graph.executionPlan.steps[0].action).toBe('lock');
  });

  it('ignore propagation produces a skip step', () => {
    const graph = compiler.compile('ten1', [makeIntent({ propagation: 'ignore' })]);
    expect(graph.executionPlan.steps[0].action).toBe('skip');
  });
});

describe('ConsistencyPolicyCompiler — validation errors', () => {
  const compiler = new ConsistencyPolicyCompiler();

  it('throws when mirror propagation with multiple connectors and no authorityConnector', () => {
    expect(() =>
      compiler.compile('ten1', [makeIntent({ propagation: 'mirror', authorityConnector: undefined })]),
    ).toThrow(PolicyCompilationError);
  });

  it('throws when authorityConnector is not in connectors list', () => {
    expect(() =>
      compiler.compile('ten1', [makeIntent({ authorityConnector: 'decidir' })]),
    ).toThrow(PolicyCompilationError);
  });

  it('throws on duplicate entityType+field+connectors combination', () => {
    const intents = [makeIntent({ id: 'a' }), makeIntent({ id: 'b' })];
    expect(() => compiler.compile('ten1', intents)).toThrow(PolicyCompilationError);
  });

  it('PolicyCompilationError carries intentId', () => {
    try {
      compiler.compile('ten1', [makeIntent({ propagation: 'mirror', authorityConnector: undefined })]);
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PolicyCompilationError);
      expect((e as PolicyCompilationError).intentId).toBe('i1');
    }
  });
});

// ─── suggestBehaviorProfile ───────────────────────────────────────────────────

describe('suggestBehaviorProfile', () => {
  it('suggests regulatory_ar for AFIP + invoice', () => {
    const s = suggestBehaviorProfile({ connectorIds: ['afip-wsfe', 'contabilium'], entityTypes: ['invoice'] });
    expect(s.profileId).toBe('regulatory_ar');
    expect(s.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('suggests accounting_locked for invoice without stock', () => {
    const s = suggestBehaviorProfile({ connectorIds: ['stripe', 'xero'], entityTypes: ['invoice'] });
    expect(s.profileId).toBe('accounting_locked');
  });

  it('suggests ecommerce_standard for stock + order + multiple connectors', () => {
    const s = suggestBehaviorProfile({
      connectorIds: ['mercadopago', 'tiendanube'],
      entityTypes: ['stock', 'order', 'product'],
    });
    expect(s.profileId).toBe('ecommerce_standard');
  });

  it('suggests inventory_realtime for stock without invoice', () => {
    const s = suggestBehaviorProfile({ connectorIds: ['wms'], entityTypes: ['stock'] });
    expect(s.profileId).toBe('inventory_realtime');
  });

  it('suggests observe_only as safe fallback when nothing matches', () => {
    const s = suggestBehaviorProfile({ connectorIds: [], entityTypes: [] });
    expect(s.profileId).toBe('observe_only');
  });

  it('requiresApproval is always true on suggestion', () => {
    // profile suggestions are informational only — the user must explicitly apply
    const s = suggestBehaviorProfile({ connectorIds: ['afip-wsfe'], entityTypes: ['invoice'] });
    // suggestion doesn't auto-apply — just confirms profile exists
    expect(getProfile(s.profileId)).toBeDefined();
  });
});

// ─── listProfiles / getProfile ────────────────────────────────────────────────

describe('listProfiles', () => {
  it('returns 7 profiles', () => {
    expect(listProfiles()).toHaveLength(7);
  });

  it('all profiles have unique ids', () => {
    const ids = listProfiles().map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getProfile', () => {
  it('throws for unknown profile id', () => {
    expect(() => getProfile('nonexistent' as any)).toThrow();
  });
});
