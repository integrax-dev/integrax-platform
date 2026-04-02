/**
 * Connector SDK — Exhaustive error class matrix tests
 */
import { describe, it, expect } from 'vitest';
import {
  ConnectorError,
  ValidationError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
  TimeoutError,
} from '../errors.js';

// ─── ConnectorError matrix ────────────────────────────────────────────────────

describe('ConnectorError', () => {
  const cases: Array<{ code: string; message: string; retryable: boolean; details?: Record<string, unknown> }> = [
    { code: 'ERR_001', message: 'Generic error', retryable: false },
    { code: 'ERR_002', message: 'Retryable error', retryable: true },
    { code: 'ERR_003', message: 'Error with details', retryable: false, details: { field: 'value' } },
    { code: 'ERR_004', message: 'Error with nested details', retryable: true, details: { nested: { a: 1 } } },
    { code: 'TIMEOUT', message: 'Request timed out', retryable: true },
    { code: 'NETWORK', message: 'Network unreachable', retryable: true },
    { code: 'PARSE_ERROR', message: 'Failed to parse response', retryable: false },
    { code: 'QUOTA_EXCEEDED', message: 'API quota exceeded', retryable: true, details: { limit: 1000 } },
    { code: 'INVALID_RESPONSE', message: 'Unexpected response format', retryable: false },
    { code: 'UPSTREAM_ERROR', message: 'Upstream service error', retryable: true, details: { upstream: 'afip' } },
    { code: 'CONFIG_ERROR', message: 'Missing required configuration', retryable: false },
    { code: 'WEBHOOK_INVALID', message: 'Webhook signature invalid', retryable: false },
    { code: 'TRANSFORM_ERROR', message: 'Data transformation failed', retryable: false },
    { code: 'SERIALIZATION_ERROR', message: 'Failed to serialize payload', retryable: false },
    { code: 'DESERIALIZE_ERROR', message: 'Failed to deserialize response', retryable: false },
  ];

  it.each(cases)('creates error with code=$code retryable=$retryable', ({ code, message, retryable, details }) => {
    const err = new ConnectorError(code, message, retryable, details);
    expect(err.code).toBe(code);
    expect(err.message).toBe(message);
    expect(err.retryable).toBe(retryable);
    expect(err.name).toBe('ConnectorError');
    expect(err).toBeInstanceOf(Error);
    if (details) expect(err.details).toEqual(details);
  });

  it('defaults retryable to false', () => {
    const err = new ConnectorError('X', 'msg');
    expect(err.retryable).toBe(false);
  });

  it('defaults details to undefined', () => {
    const err = new ConnectorError('X', 'msg', false);
    expect(err.details).toBeUndefined();
  });

  it('is instanceof Error', () => {
    expect(new ConnectorError('X', 'msg')).toBeInstanceOf(Error);
  });

  it('has stack trace', () => {
    const err = new ConnectorError('X', 'msg');
    expect(err.stack).toBeDefined();
  });
});

// ─── ValidationError matrix ───────────────────────────────────────────────────

describe('ValidationError', () => {
  const cases: Array<{ message: string; errors: Array<{ path: string; message: string }> }> = [
    { message: 'Validation failed', errors: [{ path: 'amount', message: 'Required' }] },
    { message: 'Invalid input', errors: [{ path: 'cuit', message: 'Invalid CUIT format' }] },
    { message: 'Multiple errors', errors: [{ path: 'a', message: 'err a' }, { path: 'b', message: 'err b' }] },
    { message: 'Nested path', errors: [{ path: 'order.customer.email', message: 'Invalid email' }] },
    { message: 'Array path', errors: [{ path: 'items[0].sku', message: 'SKU required' }] },
    { message: 'Empty errors', errors: [] },
    { message: 'Many errors', errors: Array.from({ length: 10 }, (_, i) => ({ path: `field${i}`, message: `error ${i}` })) },
    { message: 'Currency invalid', errors: [{ path: 'moneda', message: 'Must be ARS, BRL, MXN, CLP, COP, PEN, or UYU' }] },
  ];

  it.each(cases)('creates ValidationError: $message', ({ message, errors }) => {
    const err = new ValidationError(message, errors);
    expect(err.message).toBe(message);
    expect(err.errors).toEqual(errors);
    expect(err.name).toBe('ValidationError');
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── AuthenticationError matrix ───────────────────────────────────────────────

describe('AuthenticationError', () => {
  const messages = [
    'Authentication failed',
    'Invalid API key',
    'Token expired',
    'Invalid access token',
    'Missing Authorization header',
    'Unauthorized — check credentials',
    'API key revoked',
    'OAuth token invalid',
    'JWT signature mismatch',
    'Session expired',
  ];

  it.each(messages)('message: %s', (msg) => {
    const err = new AuthenticationError(msg);
    expect(err.message).toBe(msg);
    expect(err.code).toBe('AUTHENTICATION_ERROR');
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('AuthenticationError');
    expect(err).toBeInstanceOf(ConnectorError);
  });

  it('uses default message when none provided', () => {
    const err = new AuthenticationError();
    expect(err.message).toBe('Authentication failed');
  });

  it('accepts details', () => {
    const err = new AuthenticationError('Invalid key', { keyId: 'ixk_abc123' });
    expect(err.details?.keyId).toBe('ixk_abc123');
  });

  it('is never retryable', () => {
    const err = new AuthenticationError('bad key');
    expect(err.retryable).toBe(false);
  });
});

// ─── RateLimitError matrix ────────────────────────────────────────────────────

describe('RateLimitError', () => {
  const retryAfterValues: Array<number | undefined> = [
    undefined, 0, 100, 1000, 5000, 30000, 60000, 300000, 3600000,
  ];

  it.each(retryAfterValues)('retryAfterMs=%s', (retryAfterMs) => {
    const err = new RateLimitError(retryAfterMs);
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(retryAfterMs);
    expect(err.name).toBe('RateLimitError');
    expect(err).toBeInstanceOf(ConnectorError);
  });

  it('is always retryable', () => {
    expect(new RateLimitError(1000).retryable).toBe(true);
    expect(new RateLimitError(undefined).retryable).toBe(true);
  });

  it('includes retryAfterMs in details', () => {
    const err = new RateLimitError(5000);
    expect(err.details?.retryAfterMs).toBe(5000);
  });

  it('merges additional details', () => {
    const err = new RateLimitError(1000, { endpoint: '/api/payments' });
    expect(err.details?.endpoint).toBe('/api/payments');
    expect(err.details?.retryAfterMs).toBe(1000);
  });
});

// ─── NotFoundError matrix ─────────────────────────────────────────────────────

describe('NotFoundError', () => {
  const cases: Array<{ resourceType: string; resourceId: string }> = [
    { resourceType: 'Payment', resourceId: 'PAY-001' },
    { resourceType: 'Invoice', resourceId: 'FC-A-00001-00000001' },
    { resourceType: 'Customer', resourceId: 'CUST-123' },
    { resourceType: 'Order', resourceId: 'ORD-456' },
    { resourceType: 'Tenant', resourceId: 'tenant-ar-001' },
    { resourceType: 'Connector', resourceId: 'mercadopago' },
    { resourceType: 'Workflow', resourceId: 'wf-abc' },
    { resourceType: 'Product', resourceId: 'SKU-789' },
    { resourceType: 'Account', resourceId: 'acc-321' },
    { resourceType: 'Subscription', resourceId: 'sub-999' },
  ];

  it.each(cases)('$resourceType/$resourceId not found', ({ resourceType, resourceId }) => {
    const err = new NotFoundError(resourceType, resourceId);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain(resourceType);
    expect(err.message).toContain(resourceId);
    expect(err.retryable).toBe(false);
    expect(err.details?.resourceType).toBe(resourceType);
    expect(err.details?.resourceId).toBe(resourceId);
    expect(err.name).toBe('NotFoundError');
  });
});

// ─── ConflictError matrix ─────────────────────────────────────────────────────

describe('ConflictError', () => {
  const cases = [
    { message: 'Duplicate invoice number', details: { invoiceNumber: 'FC-A-00001-00000001' } },
    { message: 'Payment already processed', details: { paymentId: 'PAY-001' } },
    { message: 'Tenant already exists', details: { tenantId: 'tenant-ar' } },
    { message: 'Connector already registered', details: { connectorId: 'mercadopago' } },
    { message: 'Idempotency key collision', details: { key: 'abc123' } },
    { message: 'Order already fulfilled', details: { orderId: 'ORD-789' } },
    { message: 'Refund already issued', details: { refundId: 'REF-001' } },
    { message: 'Duplicate webhook event', details: { eventId: 'evt-xyz' } },
  ];

  it.each(cases)('$message', ({ message, details }) => {
    const err = new ConflictError(message, details);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe(message);
    expect(err.retryable).toBe(false);
    expect(err.details).toMatchObject(details);
    expect(err.name).toBe('ConflictError');
  });
});

// ─── ServiceUnavailableError matrix ──────────────────────────────────────────

describe('ServiceUnavailableError', () => {
  const services = [
    'AFIP WSFE',
    'MercadoPago API',
    'Contabilium',
    'Google Sheets',
    'WhatsApp Business',
    'Temporal',
    'Redis',
    'PostgreSQL',
    'Kafka',
    'Vault',
    'Anthropic API',
    'SII Chile',
    'SUNAT Perú',
    'DGI Uruguay',
    'DIAN Colombia',
    'SAT México',
  ];

  it.each(services)('service: %s', (service) => {
    const err = new ServiceUnavailableError(service);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
    expect(err.message).toContain(service);
    expect(err.retryable).toBe(true);
    expect(err.name).toBe('ServiceUnavailableError');
    expect(err).toBeInstanceOf(ConnectorError);
  });

  it('accepts additional details', () => {
    const err = new ServiceUnavailableError('AFIP', { retryAfter: 30 });
    expect(err.details?.retryAfter).toBe(30);
  });

  it('is always retryable', () => {
    expect(new ServiceUnavailableError('any').retryable).toBe(true);
  });
});

// ─── TimeoutError matrix ──────────────────────────────────────────────────────

describe('TimeoutError', () => {
  const cases: Array<{ operation: string; timeoutMs: number }> = [
    { operation: 'get_payment', timeoutMs: 5000 },
    { operation: 'create_invoice', timeoutMs: 30000 },
    { operation: 'search_payments', timeoutMs: 10000 },
    { operation: 'refund_payment', timeoutMs: 15000 },
    { operation: 'list_orders', timeoutMs: 8000 },
    { operation: 'webhook_delivery', timeoutMs: 3000 },
    { operation: 'schema_compare', timeoutMs: 60000 },
    { operation: 'llm_completion', timeoutMs: 120000 },
    { operation: 'temporal_workflow', timeoutMs: 300000 },
    { operation: 'db_query', timeoutMs: 500 },
    { operation: 'redis_get', timeoutMs: 100 },
    { operation: 'kafka_publish', timeoutMs: 2000 },
  ];

  it.each(cases)('$operation timed out after $timeoutMs ms', ({ operation, timeoutMs }) => {
    const err = new TimeoutError(operation, timeoutMs);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toContain(operation);
    expect(err.message).toContain(String(timeoutMs));
    expect(err.retryable).toBe(true);
    expect(err.details?.operation).toBe(operation);
    expect(err.details?.timeoutMs).toBe(timeoutMs);
    expect(err.name).toBe('TimeoutError');
  });

  it('is always retryable', () => {
    expect(new TimeoutError('op', 1000).retryable).toBe(true);
  });
});

// ─── Error inheritance chain ──────────────────────────────────────────────────

describe('Error inheritance', () => {
  const subclassCases: Array<{ ctor: () => ConnectorError; name: string }> = [
    { ctor: () => new AuthenticationError(), name: 'AuthenticationError' },
    { ctor: () => new RateLimitError(1000), name: 'RateLimitError' },
    { ctor: () => new NotFoundError('X', '1'), name: 'NotFoundError' },
    { ctor: () => new ConflictError('dup'), name: 'ConflictError' },
    { ctor: () => new ServiceUnavailableError('svc'), name: 'ServiceUnavailableError' },
    { ctor: () => new TimeoutError('op', 100), name: 'TimeoutError' },
  ];

  it.each(subclassCases)('$name instanceof ConnectorError', ({ ctor }) => {
    expect(ctor()).toBeInstanceOf(ConnectorError);
  });

  it.each(subclassCases)('$name instanceof Error', ({ ctor }) => {
    expect(ctor()).toBeInstanceOf(Error);
  });

  it.each(subclassCases)('$name has correct .name property', ({ ctor, name }) => {
    expect(ctor().name).toBe(name);
  });

  it.each(subclassCases)('$name has stack trace', ({ ctor }) => {
    expect(ctor().stack).toBeDefined();
  });
});
