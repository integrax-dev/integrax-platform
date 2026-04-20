/**
 * Distributed rate limiter — Redis INCR + EXPIRE
 *
 * Drop-in replacement for rate-limit.ts when REDIS_URL is set.
 * Uses the fixed-window algorithm via Redis INCR.
 *
 * Each key is: rl:{tenantId}:{userId}:{windowStart}
 * where windowStart = Math.floor(Date.now() / windowMs) * windowMs
 *
 * Usage:
 *   import { redisRateLimit } from './rate-limit-redis.js';
 *   router.post('/feedback', redisRateLimit({ maxRequests: 60, windowMs: 60_000 }), handler)
 *
 * If Redis is unavailable, returns 503 to prevent rate-limit bypass.
 *
 * TD-001 note: Only activated when REDIS_URL is set. Single-instance deployments
 * continue to use the in-process rate-limit.ts.
 */

import { Request, Response, NextFunction } from 'express';

interface RedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  quit(): Promise<void>;
}

let _redis: RedisLike | null = null;

async function getRedis(): Promise<RedisLike | null> {
  if (!process.env.REDIS_URL) return null;
  if (_redis) return _redis;
  try {
    const { Redis } = await import('ioredis');
    _redis = new Redis(process.env.REDIS_URL) as unknown as RedisLike;
    return _redis;
  } catch {
    return null;
  }
}

interface RedisRateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
  keyFn?: (req: Request) => string;
}

export function redisRateLimit(options: RedisRateLimitOptions = {}) {
  const maxRequests = options.maxRequests ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const windowSec = Math.ceil(windowMs / 1000);
  const keyFn = options.keyFn ?? ((req: Request) => {
    const tenant = req.tenantId ?? req.ip ?? 'unknown';
    const user = req.user?.id ?? req.ip ?? 'unknown';
    return `rl:${tenant}:${user}`;
  });

  return async function redisRateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const redis = await getRedis();

    if (!redis) {
      // No Redis available — pass through (degrade to no-limit rather than block)
      next();
      return;
    }

    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const key = `${keyFn(req)}:${windowStart}`;

    try {
      const count = await redis.incr(key);
      // Set TTL on first request in window so key expires automatically
      if (count === 1) {
        await redis.expire(key, windowSec + 1);
      }

      const resetAt = windowStart + windowMs;
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

      if (count > maxRequests) {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Máximo ${maxRequests} requests por ${windowMs / 1000}s. Intentá más tarde.`,
          },
        });
        return;
      }
    } catch {
      res.status(503).json({
        success: false,
        error: { code: 'RATE_LIMITER_UNAVAILABLE', message: 'Rate limiter temporarily unavailable' },
      });
      return;
    }

    next();
  };
}
