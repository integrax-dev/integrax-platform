// DLQ Manager multi-tenant (mock)
import { Event } from './types';

const dlq: Event[] = [];

export function moveToDLQ(event: Event, reason: string) {
  dlq.push({ ...event, status: 'dlq', processedAt: new Date().toISOString(), payload: { ...event.payload, dlqReason: reason } });
}

export function getDLQEvents(tenantId: string): Event[] {
  return dlq.filter(e => e.tenantId === tenantId);
}

export function retryDLQEvent(id: string): boolean {
  const idx = dlq.findIndex(e => e.id === id);
  if (idx === -1) return false;
  dlq[idx].status = 'pending';
  return true;
}

export function discardDLQEvent(id: string): boolean {
  const idx = dlq.findIndex(e => e.id === id);
  if (idx === -1) return false;
  dlq.splice(idx, 1);
  return true;
}
