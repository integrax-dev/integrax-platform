import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { rateLimit } from './rate-limit.js';

function makeReq(tenantId = 'tenant-1', userId = 'user-1'): Partial<Request> {
  return { tenantId, user: { id: userId, email: 'a@b.com', role: 'operator', tenantId } } as Partial<Request>;
}

function makeRes(): { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> } {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rateLimit middleware', () => {
  it('allows requests below the limit', () => {
    const mw = rateLimit({ maxRequests: 3, windowMs: 60_000 });
    const next = vi.fn() as unknown as NextFunction;

    for (let i = 0; i < 3; i++) {
      const res = makeRes();
      mw(makeReq() as Request, res as unknown as Response, next);
      expect(res.status).not.toHaveBeenCalledWith(429);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('returns 429 on the request that exceeds the limit', () => {
    const mw = rateLimit({ maxRequests: 2, windowMs: 60_000 });
    const next = vi.fn() as unknown as NextFunction;

    mw(makeReq() as Request, makeRes() as unknown as Response, next);
    mw(makeReq() as Request, makeRes() as unknown as Response, next);
    const res = makeRes();
    mw(makeReq() as Request, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
    }));
    expect(next).toHaveBeenCalledTimes(2); // tercer request no llama next
  });

  it('sets X-RateLimit-* headers on every request', () => {
    const mw = rateLimit({ maxRequests: 10, windowMs: 60_000 });
    const res = makeRes();
    mw(makeReq() as Request, res as unknown as Response, vi.fn() as unknown as NextFunction);

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 9);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
  });

  it('tracks different tenants independently', () => {
    const mw = rateLimit({ maxRequests: 1, windowMs: 60_000 });
    const next = vi.fn() as unknown as NextFunction;

    mw(makeReq('tenant-A') as Request, makeRes() as unknown as Response, next);
    mw(makeReq('tenant-B') as Request, makeRes() as unknown as Response, next);

    // Ambos tenant-A y tenant-B usaron 1 de su límite de 1 → ambos pasaron
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('resets the window after windowMs elapses', () => {
    vi.useFakeTimers();
    const mw = rateLimit({ maxRequests: 1, windowMs: 1_000 });
    const next = vi.fn() as unknown as NextFunction;

    mw(makeReq() as Request, makeRes() as unknown as Response, next); // OK
    const blocked = makeRes();
    mw(makeReq() as Request, blocked as unknown as Response, next);   // 429
    expect(blocked.status).toHaveBeenCalledWith(429);

    vi.advanceTimersByTime(1_001);

    const afterReset = makeRes();
    mw(makeReq() as Request, afterReset as unknown as Response, next);
    expect(afterReset.status).not.toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(2); // request 1 + request después del reset

    vi.useRealTimers();
  });
});
