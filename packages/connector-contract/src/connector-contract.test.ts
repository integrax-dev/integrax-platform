import { describe, it, expect } from 'vitest';
import { ConnectorContractRegistry } from './registry.js';
import type { ConnectorFieldSpec } from './types.js';

function makeFields(defs: Array<[string, string, boolean]>): ConnectorFieldSpec[] {
  return defs.map(([path, type, required]) => ({ path, type, required }));
}

const baseFields = makeFields([
  ['transaction_amount', 'number', true],
  ['currency', 'string', true],
  ['status', 'string', false],
]);

describe('ConnectorContractRegistry — baseline registration', () => {
  it('registers and retrieves a baseline', () => {
    const reg = new ConnectorContractRegistry();
    reg.registerBaseline({ connectorId: 'mp', schemaVersion: '1.0', fields: baseFields, registeredAt: new Date() });
    const b = reg.getBaseline('mp');
    expect(b?.connectorId).toBe('mp');
    expect(b?.fields).toHaveLength(3);
  });

  it('returns null for unknown connector', () => {
    const reg = new ConnectorContractRegistry();
    expect(reg.getBaseline('unknown')).toBeNull();
  });
});

describe('ConnectorContractRegistry — detectChanges', () => {
  it('detects no changes when schema is identical', () => {
    const reg = new ConnectorContractRegistry();
    reg.registerBaseline({ connectorId: 'mp', schemaVersion: '1.0', fields: baseFields, registeredAt: new Date() });
    const changes = reg.detectChanges('mp', baseFields);
    expect(changes).toHaveLength(0);
  });

  it('detects field_added', () => {
    const reg = new ConnectorContractRegistry();
    reg.registerBaseline({ connectorId: 'mp', schemaVersion: '1.0', fields: baseFields, registeredAt: new Date() });
    const newFields = [...baseFields, { path: 'fee_amount', type: 'number', required: false }];
    const changes = reg.detectChanges('mp', newFields);
    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe('field_added');
    expect(changes[0].fieldPath).toBe('fee_amount');
    expect(changes[0].impactScore).toBe(0);
  });

  it('detects field_removed with impact 5', () => {
    const reg = new ConnectorContractRegistry();
    reg.registerBaseline({ connectorId: 'mp', schemaVersion: '1.0', fields: baseFields, registeredAt: new Date() });
    const newFields = makeFields([['currency', 'string', true], ['status', 'string', false]]);
    const changes = reg.detectChanges('mp', newFields);
    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe('field_removed');
    expect(changes[0].impactScore).toBe(5);
  });

  it('detects type_changed with impact 4', () => {
    const reg = new ConnectorContractRegistry();
    reg.registerBaseline({ connectorId: 'mp', schemaVersion: '1.0', fields: baseFields, registeredAt: new Date() });
    const newFields = makeFields([
      ['transaction_amount', 'string', true], // was number
      ['currency', 'string', true],
      ['status', 'string', false],
    ]);
    const changes = reg.detectChanges('mp', newFields);
    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe('type_changed');
    expect(changes[0].impactScore).toBe(4);
  });

  it('detects required_changed with impact 3', () => {
    const reg = new ConnectorContractRegistry();
    reg.registerBaseline({ connectorId: 'mp', schemaVersion: '1.0', fields: baseFields, registeredAt: new Date() });
    const newFields = makeFields([
      ['transaction_amount', 'number', false], // was required
      ['currency', 'string', true],
      ['status', 'string', false],
    ]);
    const changes = reg.detectChanges('mp', newFields);
    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe('required_changed');
    expect(changes[0].impactScore).toBe(3);
  });

  it('returns empty array for unknown connector', () => {
    const reg = new ConnectorContractRegistry();
    const changes = reg.detectChanges('unknown', baseFields);
    expect(changes).toHaveLength(0);
  });

  it('accumulates changes across multiple detections', () => {
    const reg = new ConnectorContractRegistry();
    reg.registerBaseline({ connectorId: 'mp', schemaVersion: '1.0', fields: baseFields, registeredAt: new Date() });
    reg.detectChanges('mp', [...baseFields, { path: 'extra', type: 'string', required: false }]);
    reg.detectChanges('mp', [...baseFields, { path: 'extra2', type: 'string', required: false }]);
    expect(reg.listChanges({ connectorId: 'mp' })).toHaveLength(2);
  });
});

describe('ConnectorContractRegistry — listChanges filtering', () => {
  it('filters by minImpactScore', () => {
    const reg = new ConnectorContractRegistry();
    reg.registerBaseline({ connectorId: 'mp', schemaVersion: '1.0', fields: baseFields, registeredAt: new Date() });
    // field_added = impact 0, field_removed = impact 5
    const newFields = [
      ...makeFields([['currency', 'string', true], ['status', 'string', false]]),
      { path: 'new_field', type: 'string', required: false },
    ];
    reg.detectChanges('mp', newFields);
    const high = reg.listChanges({ minImpactScore: 4 });
    expect(high.every(c => c.impactScore >= 4)).toBe(true);
  });

  it('filters by connectorId', () => {
    const reg = new ConnectorContractRegistry();
    reg.registerBaseline({ connectorId: 'mp', schemaVersion: '1.0', fields: baseFields, registeredAt: new Date() });
    reg.registerBaseline({ connectorId: 'pw', schemaVersion: '1.0', fields: baseFields, registeredAt: new Date() });
    reg.detectChanges('mp', [...baseFields, { path: 'extra', type: 'string', required: false }]);
    reg.detectChanges('pw', [...baseFields, { path: 'extra2', type: 'string', required: false }]);
    const mpChanges = reg.listChanges({ connectorId: 'mp' });
    expect(mpChanges.every(c => c.connectorId === 'mp')).toBe(true);
  });
});
