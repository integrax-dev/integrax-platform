import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { validateSignature, stripSignaturePrefix } from './signature.js';
import { normalizePayload } from './normalize.js';
import type { WebhookIngestionConfig } from './types.js';

// ─── validateSignature ───────────────────────────────────────────────────────

function sign(payload: Buffer, secret: string, algo: 'sha256' | 'sha512' = 'sha256'): string {
  return createHmac(algo, secret).update(payload).digest('hex');
}

describe('validateSignature', () => {
  const secret = 'test-secret';
  const payload = Buffer.from('{"event":"order.created"}');

  it('acepta firma válida sha256', () => {
    const sig = sign(payload, secret);
    expect(validateSignature(payload, sig, secret, 'hmac-sha256')).toBe(true);
  });

  it('acepta firma válida sha512', () => {
    const sig = sign(payload, secret, 'sha512');
    expect(validateSignature(payload, sig, secret, 'hmac-sha512')).toBe(true);
  });

  it('rechaza firma incorrecta', () => {
    expect(validateSignature(payload, 'aaaabbbbcccc', secret, 'hmac-sha256')).toBe(false);
  });

  it('rechaza firma de longitud diferente', () => {
    expect(validateSignature(payload, 'too-short', secret, 'hmac-sha256')).toBe(false);
  });

  it('rechaza firma con secreto distinto', () => {
    const sig = sign(payload, 'other-secret');
    expect(validateSignature(payload, sig, secret, 'hmac-sha256')).toBe(false);
  });

  it('usa hmac-sha256 por defecto', () => {
    const sig = sign(payload, secret);
    expect(validateSignature(payload, sig, secret)).toBe(true);
  });
});

describe('stripSignaturePrefix', () => {
  it('elimina prefijo conocido', () => {
    expect(stripSignaturePrefix('sha256=abc123', 'sha256=')).toBe('abc123');
  });

  it('no modifica si el prefijo no coincide', () => {
    expect(stripSignaturePrefix('abc123', 'sha256=')).toBe('abc123');
  });

  it('devuelve el valor sin cambios si no hay prefijo', () => {
    expect(stripSignaturePrefix('abc123')).toBe('abc123');
  });
});

// ─── normalizePayload ────────────────────────────────────────────────────────

const baseConfig: WebhookIngestionConfig = {
  connectorId: 'mercadopago',
  secret: 'secret',
  signatureHeader: 'x-signature',
  signatureAlgorithm: 'hmac-sha256',
  entityType: 'payment',
};

describe('normalizePayload', () => {
  it('normaliza un payload crudo con id extraíble', () => {
    const raw = { id: 'pay-123', type: 'payment.created', amount: 5000 };
    const result = normalizePayload(raw, {}, baseConfig);

    expect(result.connectorId).toBe('mercadopago');
    expect(result.entityType).toBe('payment');
    expect(result.entityId).toBe('pay-123');
    expect(result.eventType).toBe('webhook.received');
  });

  it('resuelve eventType mediante eventTypeMap', () => {
    const config: WebhookIngestionConfig = {
      ...baseConfig,
      eventTypeMap: { 'payment.created': 'payment.created' },
    };
    const raw = { id: 'p-1', type: 'payment.created' };
    const result = normalizePayload(raw, {}, config);
    expect(result.eventType).toBe('payment.created');
  });

  it('usa webhook.received cuando el tipo no está en el mapa', () => {
    const config: WebhookIngestionConfig = {
      ...baseConfig,
      eventTypeMap: { 'payment.created': 'payment.created' },
    };
    const raw = { type: 'unknown.event' };
    const result = normalizePayload(raw, {}, config);
    expect(result.eventType).toBe('webhook.received');
  });

  it('incluye headers en el resultado', () => {
    const headers = { 'x-signature': 'abc', 'content-type': 'application/json' };
    const result = normalizePayload({}, headers, baseConfig);
    expect(result.headers['x-signature']).toBe('abc');
  });

  it('receivedAt es un ISO string', () => {
    const result = normalizePayload({}, {}, baseConfig);
    expect(() => new Date(result.receivedAt)).not.toThrow();
  });

  it('extrae entityId de resource_id si no hay id', () => {
    const raw = { resource_id: 'res-999' };
    const result = normalizePayload(raw, {}, baseConfig);
    expect(result.entityId).toBe('res-999');
  });

  it('entityId es undefined si no hay campo reconocible', () => {
    const result = normalizePayload({ foo: 'bar' }, {}, baseConfig);
    expect(result.entityId).toBeUndefined();
  });
});
