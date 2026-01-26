import { authMiddleware } from '../authMiddleware';
import { vi, describe, it, expect } from 'vitest';

describe('authMiddleware', () => {
  const next = vi.fn();
  const res = { status: vi.fn(function () { return this; }), json: vi.fn() };

  it('permite acceso con tenant y user', () => {
    const req: any = { headers: { 'x-tenant-id': 't1', 'x-user-id': 'u1' } };
    authMiddleware(req, res, next);
    expect(req.tenantId).toBe('t1');
    expect(req.userId).toBe('u1');
    expect(next).toHaveBeenCalled();
  });

  it('bloquea si falta tenantId', () => {
    const req: any = { headers: { 'x-user-id': 'u1' } };
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing tenant or user' });
  });

  it('bloquea si falta userId', () => {
    const req: any = { headers: { 'x-tenant-id': 't1' } };
    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing tenant or user' });
  });
});
