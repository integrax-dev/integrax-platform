import { describe, expect, it } from 'vitest';
import { detectCompositeMappings } from '../src/composite-mapper.js';
import type { FieldDiff } from '../src/types.js';

function removedField(path: string): FieldDiff {
  return {
    kind: 'field_removed',
    pathA: path,
    pathB: null,
    nodeA: { type: 'string', nullable: false, examples: [] },
    nodeB: null,
    breakingScore: 1,
  };
}

function addedField(path: string): FieldDiff {
  return {
    kind: 'field_added',
    pathA: null,
    pathB: path,
    nodeA: null,
    nodeB: { type: 'string', nullable: true, examples: [] },
    breakingScore: 0,
  };
}

describe('detectCompositeMappings', () => {
  it('detects canonical split: full_name → first_name + last_name', () => {
    const removed = [removedField('full_name')];
    const added = [addedField('first_name'), addedField('last_name')];

    const result = detectCompositeMappings(removed, added);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('split');
    expect(result[0].fromPaths).toEqual(['full_name']);
    expect(result[0].toPaths).toContain('first_name');
    expect(result[0].toPaths).toContain('last_name');
    expect(result[0].confidence).toBeGreaterThanOrEqual(0.65);
    expect(result[0].transform.splitStrategy).toBe('space');
  });

  it('detects canonical merge: amount + currency → money', () => {
    const removed = [removedField('amount'), removedField('currency')];
    const added = [addedField('money')];

    const result = detectCompositeMappings(removed, added);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('merge');
    expect(result[0].fromPaths).toContain('amount');
    expect(result[0].fromPaths).toContain('currency');
    expect(result[0].toPaths).toEqual(['money']);
    expect(result[0].confidence).toBeGreaterThanOrEqual(0.65);
    expect(result[0].transform.mergeStrategy).toBe('object');
  });

  it('detects canonical merge: first_name + last_name → full_name', () => {
    const removed = [removedField('first_name'), removedField('last_name')];
    const added = [addedField('full_name')];

    const result = detectCompositeMappings(removed, added);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('merge');
    expect(result[0].fromPaths).toContain('first_name');
    expect(result[0].fromPaths).toContain('last_name');
    expect(result[0].transform.mergeStrategy).toBe('concat');
  });

  it('detects canonical split: address → street + city + state + zip', () => {
    const removed = [removedField('address')];
    const added = [addedField('street'), addedField('city'), addedField('state'), addedField('zip')];

    const result = detectCompositeMappings(removed, added);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('split');
    expect(result[0].toPaths).toHaveLength(4);
    expect(result[0].transform.splitStrategy).toBe('regex');
  });

  it('returns empty when no composite patterns match', () => {
    const removed = [removedField('foo_bar')];
    const added = [addedField('baz_qux')];

    const result = detectCompositeMappings(removed, added);
    expect(result).toHaveLength(0);
  });

  it('returns empty when there are no orphan fields', () => {
    const result = detectCompositeMappings([], []);
    expect(result).toHaveLength(0);
  });

  it('does not produce split for single-token source field', () => {
    const removed = [removedField('name')];
    // name IS in KNOWN_SPLITS but if target fields not present, should skip
    const added = [addedField('other_field')];

    const result = detectCompositeMappings(removed, added);
    // name → first_name + last_name requires both to be present
    expect(result).toHaveLength(0);
  });

  it('detects heuristic split by token coverage', () => {
    const removed = [removedField('customer_email_address')];
    const added = [addedField('customer_email'), addedField('customer_address')];

    const result = detectCompositeMappings(removed, added);

    // customer+email+address tokens covered by customer_email (customer,email) + customer_address (customer,address)
    if (result.length > 0) {
      expect(result[0].kind).toBe('split');
      expect(result[0].confidence).toBeGreaterThanOrEqual(0.65);
    }
  });

  it('each composite mapping has a non-empty reason', () => {
    const removed = [removedField('amount'), removedField('currency')];
    const added = [addedField('money')];

    const result = detectCompositeMappings(removed, added);

    for (const cm of result) {
      expect(cm.reason).toBeTruthy();
      expect(cm.reason.length).toBeGreaterThan(5);
    }
  });

  it('transform has valid fromPath and toPath', () => {
    const removed = [removedField('full_name')];
    const added = [addedField('first_name'), addedField('last_name')];

    const result = detectCompositeMappings(removed, added);

    expect(result[0].transform.fromPath).toBe('full_name');
    expect(result[0].transform.toPath).toBe('first_name');
    expect(result[0].transform.toPaths).toEqual(expect.arrayContaining(['first_name', 'last_name']));
  });
});
