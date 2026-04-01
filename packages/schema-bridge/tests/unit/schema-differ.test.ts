/**
 * Unit tests for SchemaDiffer
 *
 * Verifica la detección de cada tipo de diff y sus breakingScores.
 * Estos son los valores que el resto del motor usa para priorizar alertas.
 */
import { describe, it, expect } from 'vitest';
import { SchemaDiffer } from '../../src/schema-differ.js';
import type { InferredJsonSchema, SchemaNode } from '../../src/types.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function schema(fields: Array<{ path: string; node: Partial<SchemaNode>; required?: boolean }>): InferredJsonSchema {
  return {
    fingerprint: 'test',
    sampleCount: Math.max(fields.length, 1),
    fields: fields.map(f => ({
      path: f.path,
      node: { type: 'string', nullable: false, examples: [], ...f.node } as SchemaNode,
      required: f.required ?? true,
    })),
  };
}

const differ = new SchemaDiffer();

// ─── tests ───────────────────────────────────────────────────────────────────

describe('SchemaDiffer — identical schemas', () => {
  it('produces no diffs when both schemas are equal', () => {
    const s = schema([{ path: 'name', node: { type: 'string' } }]);
    expect(differ.diff(s, s)).toHaveLength(0);
  });

  it('produces no diffs for empty schemas', () => {
    const s = schema([]);
    expect(differ.diff(s, s)).toHaveLength(0);
  });
});

describe('SchemaDiffer — field_removed', () => {
  it('detects a removed field with breakingScore 1.0', () => {
    const a = schema([{ path: 'legacy', node: {} }]);
    const b = schema([]);
    const diffs = differ.diff(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].kind).toBe('field_removed');
    expect(diffs[0].breakingScore).toBe(1.0);
    expect(diffs[0].pathA).toBe('legacy');
    expect(diffs[0].pathB).toBeNull();
  });

  it('detects multiple removed fields', () => {
    const a = schema([{ path: 'f1', node: {} }, { path: 'f2', node: {} }, { path: 'f3', node: {} }]);
    const b = schema([{ path: 'f2', node: {} }]);
    const diffs = differ.diff(a, b).filter(d => d.kind === 'field_removed');
    expect(diffs).toHaveLength(2);
    expect(diffs.every(d => d.breakingScore === 1.0)).toBe(true);
  });
});

describe('SchemaDiffer — field_added', () => {
  it('detects an added field with breakingScore 0.0', () => {
    const a = schema([]);
    const b = schema([{ path: 'newField', node: {} }]);
    const diffs = differ.diff(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].kind).toBe('field_added');
    expect(diffs[0].breakingScore).toBe(0.0);
    expect(diffs[0].pathA).toBeNull();
    expect(diffs[0].pathB).toBe('newField');
  });
});

describe('SchemaDiffer — type_changed', () => {
  it('detects string → number change as coercible (score 0.3 — can fail at runtime)', () => {
    // string→number is "coercible" in the TypeResolver: it CAN fail if the string
    // is non-numeric. Breaking score = 0.3, not a silent change.
    const a = schema([{ path: 'amount', node: { type: 'string' } }]);
    const b = schema([{ path: 'amount', node: { type: 'number' } }]);
    const diffs = differ.diff(a, b);
    const diff = diffs.find(d => d.kind === 'type_changed');
    expect(diff).toBeDefined();
    expect(diff!.breakingScore).toBeGreaterThanOrEqual(0.3);
  });

  it('detects number → boolean change', () => {
    const a = schema([{ path: 'active', node: { type: 'number' } }]);
    const b = schema([{ path: 'active', node: { type: 'boolean' } }]);
    const diffs = differ.diff(a, b);
    expect(diffs.some(d => d.kind === 'type_changed')).toBe(true);
  });

  it('does not emit format_changed when type also changed', () => {
    const a = schema([{ path: 'ts', node: { type: 'string', format: 'date' } }]);
    const b = schema([{ path: 'ts', node: { type: 'number' } }]);
    const diffs = differ.diff(a, b);
    expect(diffs.some(d => d.kind === 'type_changed')).toBe(true);
    expect(diffs.some(d => d.kind === 'format_changed')).toBe(false);
  });
});

describe('SchemaDiffer — format_changed', () => {
  it('detects date → date-time with breakingScore 0.5', () => {
    const a = schema([{ path: 'created_at', node: { type: 'string', format: 'date' } }]);
    const b = schema([{ path: 'created_at', node: { type: 'string', format: 'date-time' } }]);
    const diffs = differ.diff(a, b);
    const diff = diffs.find(d => d.kind === 'format_changed');
    expect(diff).toBeDefined();
    expect(diff!.breakingScore).toBe(0.5);
  });

  it('detects removal of format as format_changed', () => {
    const a = schema([{ path: 'ts', node: { type: 'string', format: 'date-time' } }]);
    const b = schema([{ path: 'ts', node: { type: 'string' } }]);
    const diffs = differ.diff(a, b);
    expect(diffs.some(d => d.kind === 'format_changed')).toBe(true);
  });
});

describe('SchemaDiffer — nullability_changed', () => {
  it('detects required → optional change with breakingScore 0.4', () => {
    const a = schema([{ path: 'ref', node: {}, required: true }]);
    const b = schema([{ path: 'ref', node: {}, required: false }]);
    const diffs = differ.diff(a, b);
    const diff = diffs.find(d => d.kind === 'nullability_changed');
    expect(diff).toBeDefined();
    expect(diff!.breakingScore).toBe(0.4);
  });
});

describe('SchemaDiffer — enum (constraint_changed)', () => {
  it('enum removal scores 0.95 — BREAKING', () => {
    const a = schema([{ path: 'status', node: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] } }]);
    const b = schema([{ path: 'status', node: { type: 'string', enum: ['PENDING', 'APPROVED'] } }]);
    const diffs = differ.diff(a, b);
    const diff = diffs.find(d => d.kind === 'constraint_changed');
    expect(diff).toBeDefined();
    // A consumer sending REJECTED will now fail — this is breaking.
    expect(diff!.breakingScore).toBe(0.95);
  });

  it('enum addition scores 0.20 — non-breaking for existing consumers', () => {
    const a = schema([{ path: 'status', node: { type: 'string', enum: ['PENDING', 'APPROVED'] } }]);
    const b = schema([{ path: 'status', node: { type: 'string', enum: ['PENDING', 'APPROVED', 'DISPUTED'] } }]);
    const diffs = differ.diff(a, b);
    const diff = diffs.find(d => d.kind === 'constraint_changed');
    expect(diff).toBeDefined();
    // Existing consumers never send DISPUTED — not breaking.
    expect(diff!.breakingScore).toBe(0.20);
  });

  it('removal + addition together: removal dominates (0.95)', () => {
    const a = schema([{ path: 'state', node: { type: 'string', enum: ['A', 'B'] } }]);
    const b = schema([{ path: 'state', node: { type: 'string', enum: ['B', 'C'] } }]);
    const diffs = differ.diff(a, b);
    const diff = diffs.find(d => d.kind === 'constraint_changed');
    expect(diff!.breakingScore).toBe(0.95);
  });

  it('identical enum — no constraint_changed diff', () => {
    const a = schema([{ path: 'mode', node: { type: 'string', enum: ['X', 'Y'] } }]);
    const b = schema([{ path: 'mode', node: { type: 'string', enum: ['X', 'Y'] } }]);
    const diffs = differ.diff(a, b);
    expect(diffs.some(d => d.kind === 'constraint_changed')).toBe(false);
  });

  it('real-world: MercadoPago payment status enum change', () => {
    // MP removed 'in_process' and added 'in_mediation'
    const v1 = schema([{
      path: 'status',
      node: { type: 'string', enum: ['pending', 'approved', 'rejected', 'in_process', 'refunded'] },
    }]);
    const v2 = schema([{
      path: 'status',
      node: { type: 'string', enum: ['pending', 'approved', 'rejected', 'in_mediation', 'refunded', 'cancelled'] },
    }]);
    const diffs = differ.diff(v1, v2);
    const diff = diffs.find(d => d.kind === 'constraint_changed');
    expect(diff!.breakingScore).toBe(0.95);
  });
});

describe('SchemaDiffer — sort order', () => {
  it('returns diffs sorted by breakingScore descending', () => {
    const a = schema([
      { path: 'removed', node: {} },
      { path: 'common', node: { type: 'string' } },
    ]);
    const b = schema([
      { path: 'added', node: {} },
      { path: 'common', node: { type: 'string' } },
    ]);
    const diffs = differ.diff(a, b);
    for (let i = 1; i < diffs.length; i++) {
      expect(diffs[i].breakingScore).toBeLessThanOrEqual(diffs[i - 1].breakingScore);
    }
  });
});
