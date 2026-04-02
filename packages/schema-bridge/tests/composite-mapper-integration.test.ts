import { describe, it, expect, vi } from 'vitest';
import { SchemaBridge } from '../src/bridge.js';

describe('Composite Mapper Integration', () => {
  it('detects and generates actual JS code for 1:N splitting (fullname -> first/last)', async () => {
    const bridge = new SchemaBridge({
      autoAcceptThreshold: 0.88,
      humanReviewThreshold: 0.70,
    });

    const report = await bridge.compare({
      connectorAId: 'system_a',
      connectorBId: 'system_b',
      samplesA: [
        { full_name: 'Lucas Antigravity' }
      ],
      samplesB: [
        { first_name: 'Lucas', last_name: 'Antigravity' }
      ]
    });

    expect(report.compositeMappings?.length).toBe(1);
    expect(report.compositeMappings![0].kind).toBe('split');
    
    // Check generated code actually splits string and sets first_name and last_name
    expect(report.generatedTransformTs).toContain('_src.substring(0, _spaceIdx)');
    expect(report.generatedTransformTs).toContain('output[\'first_name\'] = _parts[0]');
    expect(report.generatedTransformTs).toContain('output[\'last_name\'] = _parts[1]');
  });

  it('detects and generates actual JS code for N:1 concat merging (first/last -> fullname)', async () => {
    const bridge = new SchemaBridge({
      autoAcceptThreshold: 0.88,
      humanReviewThreshold: 0.70,
    });

    const report = await bridge.compare({
      connectorAId: 'system_a',
      connectorBId: 'system_b',
      samplesA: [
        { first_name: 'Lucas', last_name: 'Code' }
      ],
      samplesB: [
        { full_name: 'Lucas Code' }
      ]
    });

    expect(report.compositeMappings?.length).toBe(1);
    expect(report.compositeMappings![0].kind).toBe('merge');
    expect(report.compositeMappings![0].transform.mergeStrategy).toBe('concat');
    
    // Check generated code concats with a separator
    expect(report.generatedTransformTs).toContain(`(input?.['first_name'] ?? '')`);
    expect(report.generatedTransformTs).toContain(` + ' ' + `);
    expect(report.generatedTransformTs).toContain(`(input?.['last_name'] ?? '')`);
    expect(report.generatedTransformTs).toContain('output[\'full_name\'] = ');
  });

  it('detects and generates actual JS code for N:1 object merging (amount/currency -> money)', async () => {
    const bridge = new SchemaBridge({
      autoAcceptThreshold: 0.88,
      humanReviewThreshold: 0.70,
    });

    const report = await bridge.compare({
      connectorAId: 'system_a',
      connectorBId: 'system_b',
      samplesA: [
        { amount: 100, currency: 'USD' }
      ],
      samplesB: [
        { money: 'fake' } // Use money as terminal string to ensure it's seen as field_added vs removed pair
      ]
    });

    expect(report.compositeMappings?.length).toBeGreaterThan(0);
    const m = report.compositeMappings!.find(c => c.kind === 'merge' && c.toPaths[0].includes('money'));
    expect(m).toBeTruthy();
    expect(m!.transform.mergeStrategy).toBe('object');
    
    expect(report.generatedTransformTs).toContain('\'amount\': input?.[\'amount\']');
    expect(report.generatedTransformTs).toContain('\'currency\': input?.[\'currency\']');
    expect(report.generatedTransformTs).toContain('output[\'money\'] = {');
  });
});
