import { describe, it, expect } from 'vitest';
import { evaluateTolerance } from './evaluator.js';
import { ToleranceRegistry } from './registry.js';
import type { TolerancePolicy } from './types.js';

const base: TolerancePolicy = {
  id: 't1',
  strategy: 'absolute',
  value: 10,
  priority: 0,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('evaluateTolerance — absolute', () => {
  it('passes when diff <= value', () => {
    const r = evaluateTolerance(100, 108, { ...base, strategy: 'absolute', value: 10 });
    expect(r.pass).toBe(true);
  });
  it('fails when diff > value', () => {
    const r = evaluateTolerance(100, 115, { ...base, strategy: 'absolute', value: 10 });
    expect(r.pass).toBe(false);
    if (!r.pass) expect(r.deviation).toBe(15);
  });
});

describe('evaluateTolerance — relative', () => {
  it('passes when ratio <= value', () => {
    const r = evaluateTolerance(100, 105, { ...base, strategy: 'relative', value: 0.10 });
    expect(r.pass).toBe(true);
  });
  it('fails when ratio > value', () => {
    const r = evaluateTolerance(100, 120, { ...base, strategy: 'relative', value: 0.10 });
    expect(r.pass).toBe(false);
    if (!r.pass) expect(r.deviation).toBeCloseTo(20 / 120); // diff / max(|a|,|b|)
  });
});

describe('evaluateTolerance — percentage', () => {
  it('passes at exactly threshold', () => {
    const r = evaluateTolerance(100, 110, { ...base, strategy: 'percentage', value: 10 });
    expect(r.pass).toBe(true);
  });
  it('fails when percentage > value', () => {
    const r = evaluateTolerance(100, 115, { ...base, strategy: 'percentage', value: 10 });
    expect(r.pass).toBe(false);
  });
});

describe('evaluateTolerance — exact', () => {
  it('passes when values are equal', () => {
    expect(evaluateTolerance(42, 42, { ...base, strategy: 'exact', value: 0 }).pass).toBe(true);
  });
  it('fails when values differ by 1', () => {
    expect(evaluateTolerance(42, 43, { ...base, strategy: 'exact', value: 0 }).pass).toBe(false);
  });
});

describe('evaluateTolerance — always_pass', () => {
  it('always returns pass regardless of values', () => {
    expect(evaluateTolerance(0, 999999, { ...base, strategy: 'always_pass', value: 0 }).pass).toBe(true);
  });
});

describe('evaluateTolerance — null policy', () => {
  it('falls back to exact equality when no policy', () => {
    expect(evaluateTolerance(1, 1, null).pass).toBe(true);
    expect(evaluateTolerance(1, 2, null).pass).toBe(false);
  });
});

describe('ToleranceRegistry — hierarchical resolution', () => {
  it('returns null when no policies registered', () => {
    const reg = new ToleranceRegistry();
    const r = reg.resolve({ tenantId: 'ten1' });
    expect(r).toBeNull();
  });

  it('platform-wide default applies to any tenant', () => {
    const reg = new ToleranceRegistry();
    reg.register({ ...base, id: 'platform', tenantId: undefined });
    const r = reg.resolve({ tenantId: 'any-tenant' });
    expect(r?.id).toBe('platform');
  });

  it('tenant-specific policy wins over platform default', () => {
    const reg = new ToleranceRegistry();
    reg.register({ ...base, id: 'platform', tenantId: undefined, priority: 0 });
    reg.register({ ...base, id: 'tenant-specific', tenantId: 'ten1', priority: 0 });
    expect(reg.resolve({ tenantId: 'ten1' })?.id).toBe('tenant-specific');
  });

  it('field-specific policy wins over entity-level policy', () => {
    const reg = new ToleranceRegistry();
    reg.register({ ...base, id: 'entity', tenantId: 'ten1', entityType: 'payment' });
    reg.register({ ...base, id: 'field', tenantId: 'ten1', entityType: 'payment', field: 'amount' });
    expect(reg.resolve({ tenantId: 'ten1', entityType: 'payment', field: 'amount' })?.id).toBe('field');
  });

  it('different tenant policies do not bleed over', () => {
    const reg = new ToleranceRegistry();
    reg.register({ ...base, id: 'ten2-policy', tenantId: 'ten2' });
    expect(reg.resolve({ tenantId: 'ten1' })).toBeNull();
  });

  it('disabled policy is ignored', () => {
    const reg = new ToleranceRegistry();
    reg.register({ ...base, id: 'disabled', tenantId: 'ten1', enabled: false });
    expect(reg.resolve({ tenantId: 'ten1' })).toBeNull();
  });

  it('higher priority wins at same specificity level', () => {
    const reg = new ToleranceRegistry();
    reg.register({ ...base, id: 'low',  tenantId: 'ten1', priority: 0 });
    reg.register({ ...base, id: 'high', tenantId: 'ten1', priority: 10 });
    expect(reg.resolve({ tenantId: 'ten1' })?.id).toBe('high');
  });
});
