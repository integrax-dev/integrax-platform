import { rateLimiter } from '../rateLimiter';
import { vi, describe, it, expect } from 'vitest';

describe('rateLimiter', () => {
  const next = vi.fn();
  const res = { status: vi.fn(function () { return this; }), json: vi.fn() };

  it('permite dentro del límite', () => {
    const req: any = { tenantId: 't1' };
    for (let i = 0; i < 100; i++) {
      rateLimiter(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(100);
  });

  it('bloquea si excede el límite', () => {
    const req: any = { tenantId: 't2' };
    for (let i = 0; i < 101; i++) {
      rateLimiter(req, res, next);
    }
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Rate limit exceeded' });
  });

  it('bloquea si falta tenantId', () => {
    const req: any = {};
    rateLimiter(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing tenant' });
  });
});
