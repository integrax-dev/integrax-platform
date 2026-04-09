/**
 * Payway connector tests — mocked fetch
 *
 * Verifies request shape (URL, method, headers, body) without hitting the real API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaywayConnector } from '../index.js';

const CREDS = {
  site_id: 'test-site',
  api_key: 'test-api-key',
  public_key: 'test-public-key',
  sandbox: true,
};

const SANDBOX_BASE = 'https://developers.payway.com.ar/api';

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('PaywayConnector', () => {
  let connector: PaywayConnector;

  beforeEach(() => {
    connector = new PaywayConnector(CREDS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses sandbox base URL when sandbox=true', async () => {
    const spy = mockFetch({ id: 'pw_1', status: 'approved', amount: 1000, currency: 'ARS', date: '2024-01-01' });

    await connector.createPayment({ amount: 1000, card_token: 'tok_abc', installments: 1 });

    const [url] = spy.mock.calls[0];
    expect(String(url)).toContain(SANDBOX_BASE);
  });

  it('uses production base URL when sandbox=false', async () => {
    const prodConnector = new PaywayConnector({ ...CREDS, sandbox: false });
    const spy = mockFetch({ id: 'pw_2', status: 'approved', amount: 1000, currency: 'ARS', date: '2024-01-01' });

    await prodConnector.createPayment({ amount: 1000, card_token: 'tok_abc', installments: 1 });

    const [url] = spy.mock.calls[0];
    expect(String(url)).toContain('pos.payway.com.ar');
  });

  describe('createPayment', () => {
    it('sends POST to /v1/payment with token and amount', async () => {
      const spy = mockFetch({ id: 'pw_3', status: 'approved', amount: 5000, currency: 'ARS', date: '2024-01-01' });

      await connector.createPayment({ amount: 5000, card_token: 'tok_xyz', installments: 3 });

      const call = spy.mock.calls[0];
      expect(String(call[0])).toBe(`${SANDBOX_BASE}/v1/payment`);
      expect(call[1]?.method).toBe('POST');

      const body = JSON.parse(call[1]?.body as string);
      expect(body.token).toBe('tok_xyz');
      expect(body.amount).toBe(5000);
      expect(body.installments).toBe(3);
    });

    it('defaults currency to ARS', async () => {
      const spy = mockFetch({ id: 'pw_4', status: 'approved', amount: 100, currency: 'ARS', date: '2024-01-01' });
      await connector.createPayment({ amount: 100, card_token: 'tok_x', installments: 1 });
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.currency).toBe('ARS');
    });

    it('uses external_reference as site_transaction_id when provided', async () => {
      const spy = mockFetch({ id: 'pw_5', status: 'approved', amount: 200, currency: 'ARS', date: '2024-01-01' });
      await connector.createPayment({ amount: 200, card_token: 'tok_x', installments: 1, external_reference: 'order-99' });
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.site_transaction_id).toBe('order-99');
    });

    it('sends apikey header', async () => {
      const spy = mockFetch({ id: 'pw_6', status: 'approved', amount: 100, currency: 'ARS', date: '2024-01-01' });
      await connector.createPayment({ amount: 100, card_token: 'tok_x', installments: 1 });
      const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['apikey']).toBe('test-api-key');
    });
  });

  describe('authorizePayment', () => {
    it('sends capture=false in body', async () => {
      const spy = mockFetch({ id: 'pw_7', status: 'authorized', amount: 3000, currency: 'ARS', date: '2024-01-01' });
      await connector.authorizePayment({ amount: 3000, card_token: 'tok_x', installments: 1 });
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.capture).toBe(false);
    });
  });

  describe('capturePayment', () => {
    it('sends PUT to /v1/payment/:id', async () => {
      const spy = mockFetch({ id: 'pw_8', status: 'approved', amount: 1000, currency: 'ARS', date: '2024-01-01' });
      await connector.capturePayment('pw_8', 1000);
      const call = spy.mock.calls[0];
      expect(String(call[0])).toBe(`${SANDBOX_BASE}/v1/payment/pw_8`);
      expect(call[1]?.method).toBe('PUT');
    });
  });

  describe('refundPayment', () => {
    it('sends POST to /v1/payment/:id/refund', async () => {
      const spy = mockFetch({ id: 'pw_9', status: 'refunded' });
      await connector.refundPayment('pw_9');
      expect(String(spy.mock.calls[0][0])).toBe(`${SANDBOX_BASE}/v1/payment/pw_9/refund`);
    });
  });

  describe('cancelPayment', () => {
    it('sends DELETE to /v1/payment/:id', async () => {
      const spy = mockFetch({ id: 'pw_10', status: 'cancelled' });
      await connector.cancelPayment('pw_10');
      const call = spy.mock.calls[0];
      expect(String(call[0])).toBe(`${SANDBOX_BASE}/v1/payment/pw_10`);
      expect(call[1]?.method).toBe('DELETE');
    });
  });

  describe('error handling', () => {
    it('throws on non-2xx response', async () => {
      mockFetch({ error_type: 'CARD_DECLINED', message: 'Card declined' }, 402);
      await expect(connector.createPayment({ amount: 100, card_token: 'bad_tok', installments: 1 })).rejects.toThrow('402');
    });
  });
});
