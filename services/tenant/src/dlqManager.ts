/**
 * Dead Letter Queue (DLQ) Manager multi-tenant
 *
 * Uses Redis for DLQ storage with optional Kafka integration.
 * Falls back to in-memory for development.
 */
import { Redis } from 'ioredis';
import { Event } from './types.js';

// Redis client (singleton)
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);
    redis.on('error', (err) => {
      console.error('[DLQManager] Redis error:', err.message);
    });
  }
  return redis;
}

// In-memory fallback for development
const memoryDLQ: Map<string, Event> = new Map();

const DLQ_KEY_PREFIX = 'integrax:dlq';
const DLQ_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days retention

export interface DLQEntry extends Event {
  dlqReason: string;
  dlqTimestamp: string;
  retryCount: number;
  originalPayload?: unknown;
}

/**
 * Move an event to the Dead Letter Queue
 */
export async function moveToDLQ(
  event: Event,
  reason: string,
  retryCount: number = 0
): Promise<DLQEntry> {
  const dlqEntry: DLQEntry = {
    ...event,
    status: 'dlq',
    processedAt: new Date().toISOString(),
    dlqReason: reason,
    dlqTimestamp: new Date().toISOString(),
    retryCount,
    originalPayload: event.payload,
    payload: {
      ...event.payload,
      _dlq: {
        reason,
        timestamp: new Date().toISOString(),
        retryCount,
      },
    },
  };

  const redisClient = getRedis();

  if (redisClient) {
    const key = `${DLQ_KEY_PREFIX}:${event.tenantId}:${event.id}`;
    await redisClient.setex(key, DLQ_TTL_SECONDS, JSON.stringify(dlqEntry));

    // Also add to tenant's DLQ list for querying
    const listKey = `${DLQ_KEY_PREFIX}:${event.tenantId}:list`;
    await redisClient.zadd(listKey, Date.now(), event.id);
    await redisClient.expire(listKey, DLQ_TTL_SECONDS);
  } else {
    // Development fallback
    console.warn('[DLQManager] Using in-memory storage. Set REDIS_URL for production!');
    memoryDLQ.set(`${event.tenantId}:${event.id}`, dlqEntry);
  }

  console.log(`[DLQManager] Event ${event.id} moved to DLQ: ${reason}`);
  return dlqEntry;
}

/**
 * Get all DLQ events for a tenant
 */
export async function getDLQEvents(
  tenantId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<DLQEntry[]> {
  const { limit = 100, offset = 0 } = options;
  const redisClient = getRedis();

  if (redisClient) {
    const listKey = `${DLQ_KEY_PREFIX}:${tenantId}:list`;

    // Get event IDs from sorted set (newest first)
    const eventIds = await redisClient.zrevrange(listKey, offset, offset + limit - 1);

    if (eventIds.length === 0) return [];

    // Get all events
    const keys = eventIds.map((id) => `${DLQ_KEY_PREFIX}:${tenantId}:${id}`);
    const events = await redisClient.mget(...keys);

    return events
      .filter((e): e is string => e !== null)
      .map((e) => JSON.parse(e) as DLQEntry);
  }

  // Development fallback
  const events: DLQEntry[] = [];
  for (const [key, event] of memoryDLQ) {
    if (key.startsWith(`${tenantId}:`)) {
      events.push(event as DLQEntry);
    }
  }
  return events.slice(offset, offset + limit);
}

/**
 * Get a specific DLQ event
 */
export async function getDLQEvent(
  tenantId: string,
  eventId: string
): Promise<DLQEntry | null> {
  const redisClient = getRedis();

  if (redisClient) {
    const key = `${DLQ_KEY_PREFIX}:${tenantId}:${eventId}`;
    const data = await redisClient.get(key);
    return data ? (JSON.parse(data) as DLQEntry) : null;
  }

  // Development fallback
  const event = memoryDLQ.get(`${tenantId}:${eventId}`);
  return (event as DLQEntry) || null;
}

/**
 * Retry a DLQ event (mark for reprocessing)
 */
export async function retryDLQEvent(
  tenantId: string,
  eventId: string
): Promise<{ success: boolean; event?: Event }> {
  const redisClient = getRedis();

  if (redisClient) {
    const key = `${DLQ_KEY_PREFIX}:${tenantId}:${eventId}`;
    const data = await redisClient.get(key);

    if (!data) {
      return { success: false };
    }

    const dlqEntry = JSON.parse(data) as DLQEntry;

    // Restore to pending status
    const retriedEvent: Event = {
      ...dlqEntry,
      status: 'pending',
      processedAt: undefined,
      payload: dlqEntry.originalPayload || dlqEntry.payload,
    };

    // Remove from DLQ
    await redisClient.del(key);
    const listKey = `${DLQ_KEY_PREFIX}:${tenantId}:list`;
    await redisClient.zrem(listKey, eventId);

    // In production, you would publish this to Kafka for reprocessing
    // For now, just return the event
    console.log(`[DLQManager] Event ${eventId} marked for retry (attempt ${dlqEntry.retryCount + 1})`);

    return { success: true, event: retriedEvent };
  }

  // Development fallback
  const key = `${tenantId}:${eventId}`;
  const dlqEntry = memoryDLQ.get(key);

  if (!dlqEntry) {
    return { success: false };
  }

  const retriedEvent: Event = {
    ...dlqEntry,
    status: 'pending',
    processedAt: undefined,
  };

  memoryDLQ.delete(key);
  return { success: true, event: retriedEvent };
}

/**
 * Permanently discard a DLQ event
 */
export async function discardDLQEvent(
  tenantId: string,
  eventId: string
): Promise<boolean> {
  const redisClient = getRedis();

  if (redisClient) {
    const key = `${DLQ_KEY_PREFIX}:${tenantId}:${eventId}`;
    const listKey = `${DLQ_KEY_PREFIX}:${tenantId}:list`;

    const deleted = await redisClient.del(key);
    await redisClient.zrem(listKey, eventId);

    if (deleted > 0) {
      console.log(`[DLQManager] Event ${eventId} discarded from DLQ`);
      return true;
    }
    return false;
  }

  // Development fallback
  const key = `${tenantId}:${eventId}`;
  return memoryDLQ.delete(key);
}

/**
 * Get DLQ statistics for a tenant
 */
export async function getDLQStats(tenantId: string): Promise<{
  total: number;
  byReason: Record<string, number>;
}> {
  const events = await getDLQEvents(tenantId, { limit: 1000 });

  const byReason: Record<string, number> = {};
  for (const event of events) {
    const reason = event.dlqReason || 'unknown';
    byReason[reason] = (byReason[reason] || 0) + 1;
  }

  return {
    total: events.length,
    byReason,
  };
}

/**
 * Purge old DLQ events for a tenant
 */
export async function purgeDLQ(
  tenantId: string,
  olderThanDays: number = 7
): Promise<number> {
  const redisClient = getRedis();
  const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  if (redisClient) {
    const listKey = `${DLQ_KEY_PREFIX}:${tenantId}:list`;

    // Get old event IDs
    const oldEventIds = await redisClient.zrangebyscore(listKey, 0, cutoffTime);

    if (oldEventIds.length === 0) return 0;

    // Delete events
    const keys = oldEventIds.map((id) => `${DLQ_KEY_PREFIX}:${tenantId}:${id}`);
    await redisClient.del(...keys);
    await redisClient.zremrangebyscore(listKey, 0, cutoffTime);

    console.log(`[DLQManager] Purged ${oldEventIds.length} old DLQ events for tenant ${tenantId}`);
    return oldEventIds.length;
  }

  // Development fallback
  let purged = 0;
  for (const [key, event] of memoryDLQ) {
    if (key.startsWith(`${tenantId}:`) && event.processedAt) {
      const eventTime = new Date(event.processedAt).getTime();
      if (eventTime < cutoffTime) {
        memoryDLQ.delete(key);
        purged++;
      }
    }
  }
  return purged;
}

/**
 * Cleanup function for graceful shutdown
 */
export async function closeDLQManager(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
  memoryDLQ.clear();
}
