import { describe, expect, it } from 'vitest';
import { detectDrift } from '../src/drift-detector.js';
import type { FieldMapping, MappingMemoryEntry, TransformSpec } from '../src/types.js';

function makeMapping(pathA: string, pathB: string, confidence: number): FieldMapping {
  const transform: TransformSpec = { kind: 'rename', fromPath: pathA, toPath: pathB, description: 'test' };
  return { id: `m-${pathA}`, pathA, pathB, transform, confidence, bidirectional: false };
}

function makeMemoryEntry(
  pathA: string,
  pathB: string,
  averageConfidence: number,
  acceptedCount = 3,
): MappingMemoryEntry {
  return {
    sourcePath: pathA,
    targetPath: pathB,
    acceptedCount,
    rejectedCount: 0,
    averageConfidence,
    lastAcceptedAt: new Date().toISOString(),
  };
}

describe('detectDrift', () => {
  it('returns null when no memory entries exist', () => {
    const mappings = [makeMapping('id', 'payment_id', 0.90)];
    expect(detectDrift(mappings, [], 0, 0, [])).toBeNull();
  });

  it('returns null when no accepted memory entries exist', () => {
    const entry: MappingMemoryEntry = {
      sourcePath: 'id', targetPath: 'payment_id',
      acceptedCount: 0, rejectedCount: 2,
      averageConfidence: 0.9, lastAcceptedAt: new Date().toISOString(),
    };
    const mappings = [makeMapping('id', 'payment_id', 0.70)];
    expect(detectDrift(mappings, [entry], 0, 0, [])).toBeNull();
  });

  it('returns null when no active mappings (no A↔B pairs)', () => {
    const memory = [makeMemoryEntry('id', 'payment_id', 0.95)];
    // mapping with null pathA — no active pair
    const transform: TransformSpec = { kind: 'constant', fromPath: null, toPath: 'x', description: '', constant: null };
    const mappings: FieldMapping[] = [{ id: 'm1', pathA: null, pathB: 'x', transform, confidence: 0.5, bidirectional: false }];
    expect(detectDrift(mappings, memory, 0, 0, [])).toBeNull();
  });

  it('returns null when confidence drop is below threshold (0.20)', () => {
    const memory = [makeMemoryEntry('id', 'payment_id', 0.90)];
    const mappings = [makeMapping('id', 'payment_id', 0.75)]; // drop = 0.15 < 0.20
    expect(detectDrift(mappings, memory, 0, 0, [])).toBeNull();
  });

  it('detects drift when confidence drop ≥ 0.20', () => {
    const memory = [
      makeMemoryEntry('id', 'payment_id', 0.95),
      makeMemoryEntry('amount', 'total', 0.90),
    ]; // baseline avg = 0.925
    const mappings = [
      makeMapping('id', 'payment_id', 0.68),
      makeMapping('amount', 'total', 0.72),
    ]; // current avg = 0.70, drop = 0.225

    const detail = detectDrift(mappings, memory, 2, 1, ['amount']);

    expect(detail).not.toBeNull();
    expect(detail!.driftDetected).toBeUndefined(); // DriftDetail itself doesn't carry this flag
    expect(detail!.confidenceDrop).toBeGreaterThanOrEqual(0.20);
    expect(detail!.baselineAvgConfidence).toBeCloseTo(0.925);
    expect(detail!.currentAvgConfidence).toBeCloseTo(0.70);
    expect(detail!.unmatchedFieldsA).toBe(2);
    expect(detail!.unmatchedFieldsB).toBe(1);
    expect(detail!.typeChanges).toContain('amount');
  });

  it('includes all provided typeChanges in the result', () => {
    const memory = [makeMemoryEntry('x', 'y', 0.95)];
    const mappings = [makeMapping('x', 'y', 0.60)]; // drop = 0.35

    const detail = detectDrift(mappings, memory, 0, 0, ['x', 'z']);

    expect(detail).not.toBeNull();
    expect(detail!.typeChanges).toEqual(['x', 'z']);
  });

  it('exact boundary: drop == 0.20 triggers drift', () => {
    const memory = [makeMemoryEntry('a', 'b', 0.90)];
    const mappings = [makeMapping('a', 'b', 0.70)]; // drop = exactly 0.20

    const detail = detectDrift(mappings, memory, 0, 0, []);
    expect(detail).not.toBeNull();
  });
});
