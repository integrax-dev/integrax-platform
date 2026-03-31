/**
 * In-process sliding window rate limiter.
 *
 * Diseñado para endpoints de escritura de baja frecuencia (feedback, configuración).
 * No es distribuido — en multi-réplica cada instancia tiene su propia ventana.
 * Para producción con muchas réplicas, reemplazar con Redis INCR + EXPIRE.
 *
 * Uso:
 *   router.post('/feedback', rateLimit({ maxRequests: 60, windowMs: 60_000 }), handler)
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  /** Máximo de requests permitidos en la ventana (default: 60). */
  maxRequests?: number;
  /** Tamaño de la ventana en ms (default: 60_000 = 1 minuto). */
  windowMs?: number;
  /** Función para derivar la clave del request (default: tenantId:userId). */
  keyFn?: (req: Request) => string;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const maxRequests = options.maxRequests ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const keyFn = options.keyFn ?? ((req: Request) => `${req.tenantId ?? 'anon'}:${req.user?.id ?? 'anon'}`);

  const windows = new Map<string, WindowEntry>();

  // Limpieza periódica para evitar que el Map crezca indefinidamente.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windows) {
      if (entry.resetAt <= now) windows.delete(key);
    }
  }, windowMs * 2);
  // No bloquear el proceso si el servidor cierra.
  cleanup.unref();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = keyFn(req);
    const now = Date.now();

    let entry = windows.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      windows.set(key, entry);
    }

    entry.count++;

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Máximo ${maxRequests} requests por ${windowMs / 1000}s. Intentá más tarde.`,
        },
      });
    }

    next();
  };
}
