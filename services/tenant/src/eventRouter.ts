// Event Router multi-tenant (mock)
import { Event } from './types';

const events: Event[] = [];

export function ingestEvent(event: Omit<Event, 'id' | 'receivedAt' | 'status'>): Event {
  const id = 'event_' + Date.now();
  const now = new Date().toISOString();
  const newEvent: Event = {
    ...event,
    id,
    receivedAt: now,
    status: 'pending',
  };
  events.push(newEvent);
  return newEvent;
}

export function getEvents(tenantId: string): Event[] {
  return events.filter(e => e.tenantId === tenantId);
}

export function markEventProcessed(id: string): boolean {
  const event = events.find(e => e.id === id);
  if (!event) return false;
  event.status = 'processed';
  event.processedAt = new Date().toISOString();
  return true;
}
