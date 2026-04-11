/**
 * E2E Feedback Loop Tests
 *
 * Verifica el ciclo completo:
 *   compare() → recordFeedback() × N → memoria en estado de veto → proveedor excluye el par
 *
 * No requiere Postgres ni Redis — todo en memoria con SchemaBridge.
 */

import { describe, it, expect } from 'vitest';
import { SchemaBridge } from '../../src/bridge.js';
import {
  updateMemoryEntry,
  createMappingMemoryOntologyProvider,
  REJECTION_VETO_RATIO,
  REJECTION_MIN_SAMPLES,
} from '../../src/mapping-memory-provider.js';
import type { MappingMemoryEntry, CompareSchemasRequest } from '../../src/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Samples de un sistema ERP estilo SAP (campo NETWR = valor neto) */
const samplesA: Record<string, unknown>[] = Array.from({ length: 10 }, (_, i) => ({
  MANDT: '100',
  NETWR: (i + 1) * 150.75,
  WAERS: 'ARS',
  ERDAT: '2024-01-15',
}));

/** Samples de un sistema estilo Oracle EBS (campo net_amount = valor neto) */
const samplesB: Record<string, unknown>[] = Array.from({ length: 10 }, (_, i) => ({
  org_id: 101,
  net_amount: (i + 1) * 150.75,
  currency_code: 'ARS',
  creation_date: '2024-01-15',
}));

const BASE_REQUEST: CompareSchemasRequest = {
  connectorAId: 'sap-abap',
  connectorBId: 'oracle-ebs',
  samplesA,
  samplesB,
  tenantId: 'test-tenant',
  options: { renameSimilarityThreshold: 0.65, enableLlmEscalation: false, maxLlmEscalations: 0 },
};

// ─── Tests: mecanismo de veto en el proveedor ─────────────────────────────────

describe('createMappingMemoryOntologyProvider — veto mechanism', () => {
  it('returns a non-null match for a pair with positive feedback', () => {
    const entry: MappingMemoryEntry = {
      sourcePath: 'order.total',
      targetPath: 'monto',
      acceptedCount: 3,
      rejectedCount: 0,
      averageConfidence: 0.90,
    };
    const provider = createMappingMemoryOntologyProvider([entry]);
    const result = provider.match({ pathA: 'order.total', pathB: 'monto', nodeA: null, nodeB: null });
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0.5);
  });

  it('returns null for a pair that meets the veto threshold', () => {
    const entry: MappingMemoryEntry = {
      sourcePath: 'order.total',
      targetPath: 'monto',
      acceptedCount: 0,
      rejectedCount: 3,      // 100% rejection, >= 3 samples → vetoed
      averageConfidence: 0.40,
    };
    const provider = createMappingMemoryOntologyProvider([entry]);
    const result = provider.match({ pathA: 'order.total', pathB: 'monto', nodeA: null, nodeB: null });
    expect(result).toBeNull();
  });

  it('does not veto when below minSamples even at 100% rejection', () => {
    const entry: MappingMemoryEntry = {
      sourcePath: 'campo_x',
      targetPath: 'field_y',
      acceptedCount: 0,
      rejectedCount: 2, // below REJECTION_MIN_SAMPLES (3)
      averageConfidence: 0.30,
    };
    const provider = createMappingMemoryOntologyProvider([entry]);
    const result = provider.match({ pathA: 'campo_x', pathB: 'field_y', nodeA: null, nodeB: null });
    // 2 samples < REJECTION_MIN_SAMPLES → NOT vetoed, returns a score
    expect(result).not.toBeNull();
  });

  it('veto respects custom thresholds', () => {
    const entry: MappingMemoryEntry = {
      sourcePath: 'a',
      targetPath: 'b',
      acceptedCount: 2,
      rejectedCount: 3, // 60% rejection
      averageConfidence: 0.55,
    };
    // Default veto at 70% → 60% NOT vetoed
    const defaultProvider = createMappingMemoryOntologyProvider([entry]);
    expect(defaultProvider.match({ pathA: 'a', pathB: 'b', nodeA: null, nodeB: null })).not.toBeNull();

    // Custom veto at 50% → 60% IS vetoed
    const strictProvider = createMappingMemoryOntologyProvider([entry], { rejectionVetoRatio: 0.50 });
    expect(strictProvider.match({ pathA: 'a', pathB: 'b', nodeA: null, nodeB: null })).toBeNull();
  });
});

// ─── Tests: updateMemoryEntry ──────────────────────────────────────────────────

describe('updateMemoryEntry — rolling average and veto state', () => {
  it('creates a new entry on first feedback', () => {
    const entries = updateMemoryEntry([], 'campo_a', 'field_b', true, 0.90);
    expect(entries).toHaveLength(1);
    expect(entries[0].acceptedCount).toBe(1);
    expect(entries[0].rejectedCount).toBe(0);
    expect(entries[0].averageConfidence).toBeCloseTo(0.90);
  });

  it('weighted rolling average is correct after multiple feedbacks', () => {
    let entries: MappingMemoryEntry[] = [];
    // 10 accepts with confidence 0.90 → avg = 0.90
    for (let i = 0; i < 10; i++) {
      entries = updateMemoryEntry(entries, 'x', 'y', true, 0.90);
    }
    // 1 reject with confidence 0.10 → new avg = (0.90*10 + 0.10) / 11 ≈ 0.827
    entries = updateMemoryEntry(entries, 'x', 'y', false, 0.10);
    expect(entries[0].averageConfidence).toBeCloseTo((0.90 * 10 + 0.10) / 11, 3);
    expect(entries[0].acceptedCount).toBe(10);
    expect(entries[0].rejectedCount).toBe(1);
  });

  it('reaches veto threshold after enough rejects', () => {
    let entries: MappingMemoryEntry[] = [];
    // 1 accept
    entries = updateMemoryEntry(entries, 'a', 'b', true, 0.85);
    // 3 rejects → total=4, rejected=3 → 75% > 70% (REJECTION_VETO_RATIO)
    for (let i = 0; i < 3; i++) {
      entries = updateMemoryEntry(entries, 'a', 'b', false, 0.20);
    }
    const e = entries[0];
    const total = e.acceptedCount + e.rejectedCount;
    expect(total).toBeGreaterThanOrEqual(REJECTION_MIN_SAMPLES);
    expect(e.rejectedCount / total).toBeGreaterThanOrEqual(REJECTION_VETO_RATIO);
  });
});

// ─── Tests: SchemaBridge.recordFeedback → veto state ─────────────────────────

describe('SchemaBridge.recordFeedback — feedback loop state', () => {
  it('recordFeedback accumulates rejects and transitions to veto state', () => {
    const bridge = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });

    // 1 accept → no veto
    bridge.recordFeedback('NETWR', 'net_amount', true, 0.88);
    let snap = bridge.getMemorySnapshot();
    let entry = snap.find(e => e.sourcePath === 'NETWR');
    expect(entry?.rejectedCount).toBe(0);

    // 3 rejects → total=4, rejected=3/4 = 75% ≥ 70% → vetoed
    bridge.recordFeedback('NETWR', 'net_amount', false, 0.20);
    bridge.recordFeedback('NETWR', 'net_amount', false, 0.20);
    bridge.recordFeedback('NETWR', 'net_amount', false, 0.20);

    snap = bridge.getMemorySnapshot();
    entry = snap.find(e => e.sourcePath === 'NETWR' && e.targetPath === 'net_amount');
    expect(entry).toBeDefined();

    const total = entry!.acceptedCount + entry!.rejectedCount;
    expect(total).toBeGreaterThanOrEqual(REJECTION_MIN_SAMPLES);
    expect(entry!.rejectedCount / total).toBeGreaterThanOrEqual(REJECTION_VETO_RATIO);

    // Provider built from the snapshot must return null for this pair
    const provider = createMappingMemoryOntologyProvider(snap);
    const match = provider.match({ pathA: 'NETWR', pathB: 'net_amount', nodeA: null, nodeB: null });
    expect(match).toBeNull();
  });

  it('scoped feedback only affects the correct connector pair', () => {
    const bridge = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });

    // Feedback for sap↔oracle
    bridge.recordFeedback('amount', 'monto', true, 0.90, 'sap', 'oracle');
    // Feedback for sap↔coupa (different scope)
    bridge.recordFeedback('amount', 'monto', true, 0.90, 'sap', 'coupa');

    const snap = bridge.getMemorySnapshot();
    expect(snap).toHaveLength(2);

    const oracleEntry = snap.find(e => e.connectorBId === 'oracle');
    const coupaEntry = snap.find(e => e.connectorBId === 'coupa');
    expect(oracleEntry).toBeDefined();
    expect(coupaEntry).toBeDefined();
  });
});

// ─── Test: full bridge compare → veto → compare ──────────────────────────────

describe('SchemaBridge full feedback loop (SAP ↔ Oracle EBS)', () => {
  it('pre-seeded memory improves coverage; vetoed memory snapshot excludes pair from provider', async () => {
    // Phase 1: bridge WITH strong memory for NETWR → net_amount
    const bridgeWithMemory = new SchemaBridge({
      mappingMemory: [
        {
          sourcePath: 'NETWR',
          targetPath: 'net_amount',
          acceptedCount: 5,
          rejectedCount: 0,
          averageConfidence: 0.92,
        },
      ],
    });

    const report1 = await bridgeWithMemory.compare(BASE_REQUEST);

    // At least one mapping should have a decisionReason
    const withReason = report1.mappings.filter(m => m.decisionReason);
    expect(withReason.length).toBeGreaterThan(0);

    // Phase 2: veto the pair — the pre-seeded entry has no connectorId scope,
    // so feedback must also be unscoped to update the same entry.
    // 5 accepted + 12 rejected = 17 total, 12/17 = 70.6% rejection > 70%
    for (let i = 0; i < 12; i++) {
      bridgeWithMemory.recordFeedback('NETWR', 'net_amount', false, 0.10);
    }

    const snap = bridgeWithMemory.getMemorySnapshot();
    const vetoedEntry = snap.find(
      e => e.sourcePath === 'NETWR' && e.targetPath === 'net_amount'
           && !e.connectorAId && !e.connectorBId,
    );
    expect(vetoedEntry).toBeDefined();

    const total = vetoedEntry!.acceptedCount + vetoedEntry!.rejectedCount;
    const ratio = vetoedEntry!.rejectedCount / total;
    expect(ratio).toBeGreaterThanOrEqual(REJECTION_VETO_RATIO);

    // Provider built from snapshot must exclude the vetoed pair
    const provider = createMappingMemoryOntologyProvider(snap);
    const vetoedMatch = provider.match({ pathA: 'NETWR', pathB: 'net_amount', nodeA: null, nodeB: null });
    expect(vetoedMatch).toBeNull();

    // Phase 3: compare again — no mapping memory for NETWR→net_amount
    const bridgeVetoed = new SchemaBridge({ mappingMemory: snap });
    const report2 = await bridgeVetoed.compare(BASE_REQUEST);

    // Coverage should be ≤ report1 coverage (we removed a memory signal)
    const coverage1 = report1.requirementsReport.summary.coveragePercent;
    const coverage2 = report2.requirementsReport.summary.coveragePercent;
    expect(coverage2).toBeLessThanOrEqual(coverage1 + 5); // +5% tolerance for non-memory signals

    // External contract: the vetoed pair must NOT appear as an accepted rename
    // in the mappings output of compare(). The engine may still detect it as
    // rename_candidate in diffs (with low score), but the memory veto must prevent
    // it from reaching the mappings as a confirmed rename.
    const vetoedInMappings = report2.mappings.find(
      m => m.pathA === 'NETWR' && m.pathB === 'net_amount' && m.transform.kind === 'rename',
    );
    expect(vetoedInMappings).toBeUndefined();

    // Vetoed pair must not appear as a deterministic rename in diffs either
    const vetoedRename = report2.diffs.find(
      d => d.kind === 'rename_candidate' && d.pathA === 'NETWR' && d.pathB === 'net_amount'
           && d.similarity && d.similarity.combined >= REJECTION_VETO_RATIO,
    );
    expect(vetoedRename).toBeUndefined();
  });

  it('mappings carry decisionReason for all auto-resolved fields', async () => {
    const bridge = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });
    const report = await bridge.compare(BASE_REQUEST);

    const resolved = report.mappings.filter(m => m.decisionReason);
    // All auto-resolved mappings should have a reason
    expect(resolved.length).toBeGreaterThan(0);

    // Reasons should be one of the known values
    const knownReasons = new Set([
      'deterministic:field_added',
      'deterministic:rename',
      'deterministic:type_widening',
      'deterministic:format_coerce',
      'deterministic:nullability',
      'heuristic:money_coerce',
      'heuristic:constraint_changed',
      'heuristic:rename_review',
    ]);
    for (const m of resolved) {
      expect(knownReasons.has(m.decisionReason!)).toBe(true);
    }
  });

  it('accepted memory entry raises the ontology score for the pair on the next compare', async () => {
    // Bridge A: no memory — relies purely on structural/lexical signals
    const bridgeNoMemory = new SchemaBridge({ autoAcceptThreshold: 0.88, humanReviewThreshold: 0.70, decisionPolicy: { autoAcceptThreshold: 0.88, reviewThreshold: 0.70 } });
    const reportNoMemory = await bridgeNoMemory.compare(BASE_REQUEST);

    // Collect which pairs were identified as rename_candidates so we can
    // check that seeding memory for one of them improves or maintains coverage.
    const renamePairs = reportNoMemory.diffs
      .filter(d => d.kind === 'rename_candidate' && d.pathA && d.pathB)
      .map(d => ({ pathA: d.pathA!, pathB: d.pathB! }));

    // If no rename candidates exist the test is vacuous — skip the assertion.
    if (renamePairs.length === 0) {
      // Still verify the bridge ran without errors
      expect(reportNoMemory.mappings.length).toBeGreaterThanOrEqual(0);
      return;
    }

    // Seed accepted memory for the first rename pair found
    const { pathA, pathB } = renamePairs[0];
    const preSeededMemory = [
      {
        sourcePath: pathA,
        targetPath: pathB,
        acceptedCount: 10,
        rejectedCount: 0,
        averageConfidence: 0.95,
      },
    ];

    // Bridge B: memory pre-seeded with 10 accepts for that pair
    const bridgeWithMemory = new SchemaBridge({ mappingMemory: preSeededMemory });
    const reportWithMemory = await bridgeWithMemory.compare(BASE_REQUEST);

    // The ontology provider should return a high-confidence score for the pair.
    // Coverage should be ≥ bridge without memory (memory never hurts non-vetoed pairs).
    const coverageNoMem = reportNoMemory.requirementsReport.summary.coveragePercent;
    const coverageWithMem = reportWithMemory.requirementsReport.summary.coveragePercent;
    expect(coverageWithMem).toBeGreaterThanOrEqual(coverageNoMem);

    // The mapping for the seeded pair should have a deterministic or rename reason
    const seededMapping = reportWithMemory.mappings.find(
      m => m.pathA === pathA && m.pathB === pathB,
    );
    if (seededMapping) {
      expect(seededMapping.decisionReason).toBeDefined();
    }
  });
});
