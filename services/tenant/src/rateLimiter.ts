/**
 * Rate Limiter per tenant using Redis sliding window
 *
 * Uses a sliding window counter algorithm for accurate rate limiting.
 * Falls back to in-memory for development if Redis is unavailable.
 */
import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { Tenant } from './types.js';

const isProduction = process.env.NODE_ENV === 'production';

// Redis client (singleton)
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL);
    redis.on('error', (err) => {
      console.error('[RateLimiter] Redis error:', err.message);
    });
  }
  return redis;
}

// In-memory fallback for development
const memoryStore: Map<string, { count: number; windowStart: number }> = new Map();

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

// Default limits by plan
const PLAN_LIMITS: Record<string, RateLimitConfig> = {
  free: { windowMs: 60000, maxRequests: 60 },        // 60/min
  starter: { windowMs: 60000, maxRequests: 300 },    // 300/min
  professional: { windowMs: 60000, maxRequests: 1000 }, // 1000/min
  enterprise: { windowMs: 60000, maxRequests: 5000 },   // 5000/min
  default: { windowMs: 60000, maxRequests: 100 },
};

/**
 * Get rate limit config for tenant
 */
async function getTenantLimit(tenantId: string, plan?: string): Promise<RateLimitConfig> {
  // In production, fetch from database or cache
  // For now, use plan-based limits
  const limitConfig = PLAN_LIMITS[plan || 'default'] || PLAN_LIMITS.default;
  return limitConfig;
}

/**
 * Redis-based sliding window rate limiter
 */
async function checkRateLimitRedis(
  redis: Redis,
  tenantId: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const key = `ratelimit:${tenantId}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Use Redis transaction for atomic operations
  const multi = redis.multi();

  // Remove old entries outside the window
  multi.zremrangebyscore(key, 0, windowStart);

  // Count requests in current window
  multi.zcard(key);

  // Add current request
  multi.zadd(key, now.toString(), `${now}-${Math.random()}`);

  // Set expiry on the key
  multi.pexpire(key, config.windowMs);

  const results = await multi.exec();

  if (!results) {
    // Redis transaction failed, allow request but log
    console.warn('[RateLimiter] Redis transaction failed for tenant:', tenantId);
    return { allowed: true, remaining: 0, resetMs: 0 };
  }

  const currentCount = (results[1]?.[1] as number) || 0;
  const allowed = currentCount < config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - currentCount - 1);
  const resetMs = config.windowMs;

  return { allowed, remaining, resetMs };
}

/**
 * In-memory rate limiter (fallback for development)
 */
function checkRateLimitMemory(
  tenantId: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const key = tenantId;

  let entry = memoryStore.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    // New window
    entry = { count: 0, windowStart: now };
  }

  entry.count++;
  memoryStore.set(key, entry);

  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetMs = config.windowMs - (now - entry.windowStart);

  return { allowed, remaining, resetMs };
}

/**
 * Express middleware for rate limiting
 */
export function rateLimiter(options: { getTenantPlan?: (tenantId: string) => Promise<string | undefined> } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = (req as any).tenantId as string | undefined;

    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant context required' },
      });
    }

    try {
      // Get tenant's plan for limit config
      const plan = options.getTenantPlan
        ? await options.getTenantPlan(tenantId)
        : undefined;

      const config = await getTenantLimit(tenantId, plan);

      // Check rate limit
      const redisClient = getRedis();
      if (!redisClient && isProduction) {
        throw new Error('REDIS_URL is required in production for rate limiting');
      }
      const result = redisClient
        ? await checkRateLimitRedis(redisClient, tenantId, config)
        : checkRateLimitMemory(tenantId, config);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetMs / 1000));

      if (!result.allowed) {
        res.setHeader('Retry-After', Math.ceil(result.resetMs / 1000));
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil(result.resetMs / 1000),
          },
        });
      }

      next();
    } catch (error) {
      // On error, allow the request but log
      console.error('[RateLimiter] Error:', error);
      next();
    }
  };
}

/**
 * Get current usage for a tenant
 */
export async function getTenantUsage(tenantId: string): Promise<{
  current: number;
  limit: number;
  windowMs: number;
} | null> {
  const config = await getTenantLimit(tenantId);
  const redisClient = getRedis();

  if (!redisClient && isProduction) {
    throw new Error('REDIS_URL is required in production for usage metrics');
  }

  if (redisClient) {
    const key = `ratelimit:${tenantId}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    await redisClient.zremrangebyscore(key, 0, windowStart);
    const count = await redisClient.zcard(key);

    return {
      current: count,
      limit: config.maxRequests,
      windowMs: config.windowMs,
    };
  }

  // Memory fallback
  const entry = memoryStore.get(tenantId);
  return {
    current: entry?.count || 0,
    limit: config.maxRequests,
    windowMs: config.windowMs,
  };
}

/**
 * Reset rate limit for a tenant (admin operation)
 */
export async function resetTenantRateLimit(tenantId: string): Promise<void> {
  const redisClient = getRedis();

  if (!redisClient && isProduction) {
    throw new Error('REDIS_URL is required in production for rate limit reset');
  }

  if (redisClient) {
    await redisClient.del(`ratelimit:${tenantId}`);
  }

  memoryStore.delete(tenantId);
}

/**
 * Cleanup function for graceful shutdown
 */
export async function closeRateLimiter(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
  memoryStore.clear();
}
