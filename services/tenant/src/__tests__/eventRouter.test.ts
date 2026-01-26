import { ingestEvent, getEvents, markEventProcessed } from '../eventRouter';
import { describe, it, expect } from 'vitest';

describe('eventRouter', () => {
  it('ingesta y recupera eventos por tenant', () => {
    const event = ingestEvent({ tenantId: 't1', type: 'test', payload: {}, schemaVersion: 'v1' });
    const events = getEvents('t1');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].tenantId).toBe('t1');
    expect(events[0].status).toBe('pending');
  });

  it('marca evento como procesado', () => {
    const event = ingestEvent({ tenantId: 't2', type: 'test', payload: {}, schemaVersion: 'v1' });
    const ok = markEventProcessed(event.id);
    expect(ok).toBe(true);
    const events = getEvents('t2');
    expect(events[0].status).toBe('processed');
  });
});
