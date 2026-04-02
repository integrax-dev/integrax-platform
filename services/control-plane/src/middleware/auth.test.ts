/**
 * Tests unitarios para middleware/auth.ts
 *
 * Cubre:
 * - requireAuth: path JWT (happy + inválido) y path API key (happy + todos los errores)
 * - requireTenant: con y sin tenantId previo, acceso cruzado de tenant
 * - verifyWebhookSignature: firma correcta, firma incorrecta, longitud distinta
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { getTenantMock } = vi.hoisted(() => ({ getTenantMock: vi.fn() }));

vi.mock('../store/tenants.js', () => ({
  getTenant: getTenantMock,
}));

// bcrypt: usamos la implementación real para verifyWebhookSignature, pero mockeamos
// compare() para los tests de API key para evitar el costo de hashing real.
vi.mock('bcrypt', () => ({
  compare: vi.fn(),
}));

import * as bcrypt from 'bcrypt';
import { requireAuth, requireTenant, verifyWebhookSignature } from './auth.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    user: undefined,
    tenantId: undefined,
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
}

const next: NextFunction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  getTenantMock.mockReset();
});

// ─── requireAuth — Bearer JWT ─────────────────────────────────────────────────

describe('requireAuth — Bearer JWT', () => {
  it('devuelve 401 si no hay header Authorization', async () => {
    const req = makeReq();
    const { res, status } = makeRes();

    await requireAuth(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('devuelve 401 con INVALID_TOKEN si el JWT es inválido', async () => {
    const req = makeReq({ headers: { authorization: 'Bearer invalid.token.here' } });
    const { res, status, json } = makeRes();

    await requireAuth(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('INVALID_TOKEN');
  });
});

// ─── requireAuth — API Key ────────────────────────────────────────────────────

describe('requireAuth — API Key', () => {
  it('devuelve 400 si falta el header X-Tenant-Id', async () => {
    const req = makeReq({ headers: { authorization: 'ApiKey ixk_somekey' } });
    const { res, status, json } = makeRes();

    await requireAuth(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('MISSING_TENANT');
  });

  it('devuelve 401 si la API key no empieza con ixk_', async () => {
    const req = makeReq({
      headers: {
        authorization: 'ApiKey sk_wrong_prefix',
        'x-tenant-id': 'tenant-1',
      },
    });
    const { res, status, json } = makeRes();

    await requireAuth(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('INVALID_API_KEY');
  });

  it('devuelve 401 si el tenant no existe', async () => {
    getTenantMock.mockResolvedValue(null);

    const req = makeReq({
      headers: {
        authorization: 'ApiKey ixk_validkey',
        'x-tenant-id': 'tenant-inexistente',
      },
    });
    const { res, status, json } = makeRes();

    await requireAuth(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('INVALID_TENANT');
  });

  it('devuelve 403 si el tenant está suspendido', async () => {
    getTenantMock.mockResolvedValue({ status: 'suspended', apiKeyHash: 'hash' });

    const req = makeReq({
      headers: {
        authorization: 'ApiKey ixk_validkey',
        'x-tenant-id': 'tenant-1',
      },
    });
    const { res, status, json } = makeRes();

    await requireAuth(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(403);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('TENANT_INACTIVE');
  });

  it('devuelve 401 si el hash de la API key no coincide', async () => {
    getTenantMock.mockResolvedValue({ status: 'active', apiKeyHash: '$2b$hashed' });
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const req = makeReq({
      headers: {
        authorization: 'ApiKey ixk_wrongkey',
        'x-tenant-id': 'tenant-1',
      },
    });
    const { res, status, json } = makeRes();

    await requireAuth(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('UNAUTHORIZED_API_KEY');
  });

  it('llama next() con role operator cuando la API key es válida', async () => {
    getTenantMock.mockResolvedValue({ status: 'active', apiKeyHash: '$2b$hashed' });
    (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const req = makeReq({
      headers: {
        authorization: 'ApiKey ixk_validkey',
        'x-tenant-id': 'tenant-1',
      },
    });
    const { res } = makeRes();

    await requireAuth(req, res, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(req.user?.role).toBe('operator');
    expect(req.tenantId).toBe('tenant-1');
  });
});

// ─── requireTenant ────────────────────────────────────────────────────────────

describe('requireTenant', () => {
  it('llama next() si req.tenantId ya está establecido', () => {
    const req = makeReq({ tenantId: 'tenant-1' } as Partial<Request>);
    const { res } = makeRes();

    requireTenant(req, res, next as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('devuelve 400 si no hay tenantId ni header ni user.tenantId', () => {
    const req = makeReq({ user: { id: 'u1', email: 'a@b.com', role: 'operator', tenantId: null } });
    const { res, status } = makeRes();

    requireTenant(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('devuelve 403 si el usuario no es platform_admin y el header apunta a otro tenant', () => {
    const req = makeReq({
      headers: { 'x-tenant-id': 'tenant-otro' },
      user: { id: 'u1', email: 'a@b.com', role: 'tenant_admin', tenantId: 'tenant-1' },
    });
    const { res, status, json } = makeRes();

    requireTenant(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(403);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('platform_admin puede acceder a cualquier tenant via header', () => {
    const req = makeReq({
      headers: { 'x-tenant-id': 'tenant-ajeno' },
      user: { id: 'admin', email: 'a@b.com', role: 'platform_admin', tenantId: null },
    });
    const { res } = makeRes();

    requireTenant(req, res, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('tenant-ajeno');
  });

  it('usa user.tenantId si no hay header', () => {
    const req = makeReq({
      user: { id: 'u1', email: 'a@b.com', role: 'tenant_admin', tenantId: 'tenant-del-token' },
    });
    const { res } = makeRes();

    requireTenant(req, res, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('tenant-del-token');
  });
});

// ─── verifyWebhookSignature ───────────────────────────────────────────────────

describe('verifyWebhookSignature', () => {
  const secret = 'mi-secreto-de-webhook';
  const payload = '{"event":"payment.created","id":"pay_123"}';

  // Generar la firma correcta con Node.js crypto para los tests
  function sign(p: string, s: string): string {
    return createHmac('sha256', s).update(p).digest('hex');
  }

  it('devuelve true para una firma HMAC-SHA256 correcta', () => {
    const signature = sign(payload, secret);
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it('devuelve false para una firma incorrecta', () => {
    expect(verifyWebhookSignature(payload, 'firma_incorrecta_64caracteres_de_largo_xxxxxxxxxxxxxxxx', secret)).toBe(false);
  });

  it('devuelve false (sin tirar) si la firma tiene longitud distinta al HMAC esperado', () => {
    // Una firma truncada o extendida no debe lanzar ERR_CRYPTO_TIMINGSAFEEQUAL_BUFFERS_LENGTH
    expect(() => verifyWebhookSignature(payload, 'corta', secret)).not.toThrow();
    expect(verifyWebhookSignature(payload, 'corta', secret)).toBe(false);
  });

  it('devuelve false para string vacío', () => {
    expect(verifyWebhookSignature(payload, '', secret)).toBe(false);
  });

  it('devuelve false si el payload fue alterado', () => {
    const signature = sign(payload, secret);
    const alteredPayload = payload.replace('pay_123', 'pay_999');
    expect(verifyWebhookSignature(alteredPayload, signature, secret)).toBe(false);
  });
});
