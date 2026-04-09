/**
 * Decidir connector tests — mocked fetch
 *
 * Verifies two-step auth/capture, direct payment, refund and cancel
 * without hitting Decidir's API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DecidirConnector } from '../index.js';

const CREDS = {
  private_api_key: 'priv_test_key',
  public_api_key: 'pub_test_key',
  sandbox: true,
};

const SANDBOX_BASE = 'https://developers.decidir.com/api/v2';

function mockDecidirPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1001,
    site_transaction_id: 'dc_test',
    payment_method_id: 1,
    amount: 5000,
    currency: 'ARS',
    installments: 1,
    status: 'approved',
    status_details: {
      ticket: '123',
      card_authorization_code: 'ABCD',
      address_validation_code: '00',
      error: null,
    },
    date: '2024-01-01',
    ...overrides,
  };
}

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('DecidirConnector', () => {
  let connector: DecidirConnector;

  beforeEach(() => {
    connector = new DecidirConnector(CREDS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses sandbox base URL when sandbox=true', async () => {
    const spy = mockFetch(mockDecidirPayment());
    await connector.createPayment({ token: 'tok_x', amount: 100, installments: 1, payment_method_id: 1 });
    expect(String(spy.mock.calls[0][0])).toContain(SANDBOX_BASE);
  });

  it('uses production base URL when sandbox=false', async () => {
    const prod = new DecidirConnector({ ...CREDS, sandbox: false });
    const spy = mockFetch(mockDecidirPayment());
    await prod.createPayment({ token: 'tok_x', amount: 100, installments: 1, payment_method_id: 1 });
    expect(String(spy.mock.calls[0][0])).toContain('live.decidir.com');
  });

  describe('createPayment', () => {
    it('sends POST to /payments', async () => {
      const spy = mockFetch(mockDecidirPayment());
      await connector.createPayment({ token: 'tok_abc', amount: 5000, installments: 3, payment_method_id: 1 });
      expect(String(spy.mock.calls[0][0])).toBe(`${SANDBOX_BASE}/payments`);
      expect(spy.mock.calls[0][1]?.method).toBe('POST');
    });

    it('body includes token, amount, installments, payment_method_id', async () => {
      const spy = mockFetch(mockDecidirPayment());
      await connector.createPayment({ token: 'tok_abc', amount: 5000, installments: 3, payment_method_id: 6 });
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.token).toBe('tok_abc');
      expect(body.amount).toBe(5000);
      expect(body.installments).toBe(3);
      expect(body.payment_method_id).toBe(6);
    });

    it('defaults currency to ARS', async () => {
      const spy = mockFetch(mockDecidirPayment());
      await connector.createPayment({ token: 'tok_x', amount: 100, installments: 1, payment_method_id: 1 });
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.currency).toBe('ARS');
    });

    it('sends apikey header with private key', async () => {
      const spy = mockFetch(mockDecidirPayment());
      await connector.createPayment({ token: 'tok_x', amount: 100, installments: 1, payment_method_id: 1 });
      const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['apikey']).toBe('priv_test_key');
    });

    it('omits capture field by default (direct capture)', async () => {
      const spy = mockFetch(mockDecidirPayment());
      await connector.createPayment({ token: 'tok_x', amount: 100, installments: 1, payment_method_id: 1 });
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.capture).toBeUndefined();
    });
  });

  describe('authorizePayment', () => {
    it('sets capture=false for pre-authorization', async () => {
      const spy = mockFetch(mockDecidirPayment({ status: 'pre_approved' }));
      await connector.authorizePayment({ token: 'tok_x', amount: 2000, installments: 1, payment_method_id: 1 });
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.capture).toBe(false);
    });
  });

  describe('capturePayment', () => {
    it('sends PUT to /payments/:id with amount', async () => {
      const spy = mockFetch(mockDecidirPayment());
      await connector.capturePayment(1001, 5000);
      const call = spy.mock.calls[0];
      expect(String(call[0])).toBe(`${SANDBOX_BASE}/payments/1001`);
      expect(call[1]?.method).toBe('PUT');
      const body = JSON.parse(call[1]?.body as string);
      expect(body.amount).toBe(5000);
    });
  });

  describe('refundPayment', () => {
    it('sends POST to /payments/:id/refunds', async () => {
      const spy = mockFetch({ id: 'ref_1', status: 'refunded' });
      await connector.refundPayment(1001, 1000);
      const call = spy.mock.calls[0];
      expect(String(call[0])).toBe(`${SANDBOX_BASE}/payments/1001/refunds`);
      expect(call[1]?.method).toBe('POST');
      const body = JSON.parse(call[1]?.body as string);
      expect(body.amount).toBe(1000);
    });

    it('partial refund — amount can be less than payment amount', async () => {
      const spy = mockFetch({ id: 'ref_2', amount: 500, status: 'refunded' });
      await connector.refundPayment(1001, 500);
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.amount).toBe(500);
    });
  });

  describe('cancelPayment', () => {
    it('sends DELETE to /payments/:id', async () => {
      const spy = mockFetch({ id: 1001, status: 'cancelled' });
      await connector.cancelPayment(1001);
      const call = spy.mock.calls[0];
      expect(String(call[0])).toBe(`${SANDBOX_BASE}/payments/1001`);
      expect(call[1]?.method).toBe('DELETE');
    });
  });

  describe('getPayment', () => {
    it('sends GET to /payments/:id', async () => {
      const spy = mockFetch(mockDecidirPayment());
      await connector.getPayment(1001);
      expect(String(spy.mock.calls[0][0])).toBe(`${SANDBOX_BASE}/payments/1001`);
      expect(spy.mock.calls[0][1]?.method).toBe('GET');
    });
  });

  describe('error handling', () => {
    it('throws on 402 with error message', async () => {
      mockFetch({ message: 'Insufficient funds', error: 'payment_declined' }, 402);
      await expect(
        connector.createPayment({ token: 'bad_tok', amount: 100, installments: 1, payment_method_id: 1 }),
      ).rejects.toThrow('402');
    });
  });
});
