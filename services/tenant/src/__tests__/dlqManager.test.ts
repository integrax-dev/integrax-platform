import { moveToDLQ, getDLQEvents, retryDLQEvent, discardDLQEvent } from '../dlqManager';
import { describe, it, expect } from 'vitest';

describe('dlqManager', () => {
  it('mueve y recupera eventos en DLQ por tenant', () => {
    const event = { id: 'e1', tenantId: 't1', type: 'fail', payload: {}, schemaVersion: 'v1', receivedAt: '', status: 'failed' };
    moveToDLQ(event, 'error');
    const dlqEvents = getDLQEvents('t1');
    expect(dlqEvents.length).toBeGreaterThan(0);
    expect(dlqEvents[0].status).toBe('dlq');
    expect(dlqEvents[0].payload.dlqReason).toBe('error');
  });

  it('reintenta y descarta eventos DLQ', () => {
    const event = { id: 'e2', tenantId: 't2', type: 'fail', payload: {}, schemaVersion: 'v1', receivedAt: '', status: 'failed' };
    moveToDLQ(event, 'error');
    const okRetry = retryDLQEvent('e2');
    expect(okRetry).toBe(true);
    const okDiscard = discardDLQEvent('e2');
    expect(okDiscard).toBe(true);
    const dlqEvents = getDLQEvents('t2');
    expect(dlqEvents.length).toBe(0);
  });
});
