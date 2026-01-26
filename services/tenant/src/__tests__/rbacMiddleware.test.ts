import { rbacMiddleware } from '../rbacMiddleware';
import { vi, describe, it, expect } from 'vitest';

describe('rbacMiddleware', () => {
  const next = vi.fn();
  const res = { status: vi.fn(function () { return this; }), json: vi.fn() };

  it('permite acceso con rol suficiente', () => {
    const req = { userRole: 'platform-admin' };
    rbacMiddleware('tenant-admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('bloquea acceso con rol insuficiente', () => {
    const req = { userRole: 'viewer' };
    rbacMiddleware('tenant-admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
  });

  it('bloquea si falta userRole', () => {
    const req = {};
    rbacMiddleware('tenant-admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing user role' });
  });
});
