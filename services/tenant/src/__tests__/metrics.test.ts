import { recordEvent, getMetrics } from '../metrics';
import { describe, it, expect } from 'vitest';

describe('metrics', () => {
  it('registra y recupera métricas por tenant', () => {
    recordEvent('t1', true, 100);
    recordEvent('t1', false, 200);
    const m = getMetrics('t1');
    expect(m).toBeDefined();
    expect(m?.events).toBe(2);
    expect(m?.successes).toBe(1);
    expect(m?.failures).toBe(1);
    expect(m?.latencyAvg).toBe(150);
  });
});
