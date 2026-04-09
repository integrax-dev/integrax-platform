/**
 * Payment provider capability matrix tests
 */

import { describe, it, expect } from 'vitest';
import {
  PAYMENT_PROVIDER_MATRIX,
  getProviderMatrix,
  getProvidersForCapability,
  getCapabilityStatus,
} from '../payment-provider-matrix.js';

describe('PAYMENT_PROVIDER_MATRIX', () => {
  it('contains entries for all expected providers', () => {
    const ids = PAYMENT_PROVIDER_MATRIX.map(p => p.providerId);
    const required = ['mercadopago', 'payway', 'mobbex', 'decidir', 'getnet', 'fiserv', 'payu', 'dlocal', 'paypal', 'stripe', 'wibond', 'addi'];
    for (const id of required) {
      expect(ids).toContain(id);
    }
  });

  it('every entry has all 13 capability keys', () => {
    const CAPABILITIES = [
      'create_payment', 'authorize_payment', 'capture_payment', 'refund_payment',
      'cancel_payment', 'tokenize_payment_method', 'create_subscription', 'cancel_subscription',
      'create_checkout_link', 'generate_qr_payment', 'create_split_payment',
      'reconcile_payment', 'send_payment_reminder',
    ] as const;

    for (const entry of PAYMENT_PROVIDER_MATRIX) {
      for (const cap of CAPABILITIES) {
        expect(entry.capabilities[cap], `${entry.providerId}.${cap}`).toBeDefined();
        expect(['full', 'partial', 'unsupported', 'unknown']).toContain(entry.capabilities[cap].status);
      }
    }
  });

  it('mercadopago has full create_payment', () => {
    const mp = getProviderMatrix('mercadopago')!;
    expect(mp.capabilities.create_payment.status).toBe('full');
  });

  it('mercadopago has full generate_qr_payment', () => {
    const mp = getProviderMatrix('mercadopago')!;
    expect(mp.capabilities.generate_qr_payment.status).toBe('full');
  });

  it('payway does not support subscriptions', () => {
    const pw = getProviderMatrix('payway')!;
    expect(pw.capabilities.create_subscription.status).toBe('unsupported');
    expect(pw.capabilities.cancel_subscription.status).toBe('unsupported');
  });

  it('decidir does not support QR', () => {
    const dc = getProviderMatrix('decidir')!;
    expect(dc.capabilities.generate_qr_payment.status).toBe('unsupported');
  });

  it('wibond does not support tokenization', () => {
    const wb = getProviderMatrix('wibond')!;
    expect(wb.capabilities.tokenize_payment_method.status).toBe('unsupported');
  });
});

describe('getProvidersForCapability', () => {
  it('returns only providers with at least the given status', () => {
    const fullOnly = getProvidersForCapability('create_payment', 'full');
    expect(fullOnly.every(p => p.capabilities.create_payment.status === 'full')).toBe(true);
  });

  it('returns mercadopago for generate_qr_payment at partial threshold', () => {
    const providers = getProvidersForCapability('generate_qr_payment', 'partial');
    const ids = providers.map(p => p.providerId);
    expect(ids).toContain('mercadopago');
  });

  it('returns empty for generate_qr_payment at full threshold (only mercadopago is full)', () => {
    const providers = getProvidersForCapability('generate_qr_payment', 'full');
    const ids = providers.map(p => p.providerId);
    expect(ids).toContain('mercadopago');
    expect(ids).not.toContain('payway');
    expect(ids).not.toContain('decidir');
  });
});

describe('getCapabilityStatus', () => {
  it('returns the entry for a known provider + capability', () => {
    const status = getCapabilityStatus('mercadopago', 'refund_payment');
    expect(status).not.toBeNull();
    expect(status!.status).toBe('full');
  });

  it('returns null for unknown provider', () => {
    const status = getCapabilityStatus('unknown-psp', 'create_payment');
    expect(status).toBeNull();
  });
});
