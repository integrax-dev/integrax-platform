/**
 * Mobbex connector tests — mocked fetch
 *
 * Verifies checkout creation, refund, cancel, and subscription lifecycle
 * without hitting the real Mobbex API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MobbexConnector } from '../index.js';

const CREDS = {
  api_key: 'test-api-key',
  access_token: 'test-access-token',
};

const BASE_URL = 'https://res.mobbex.com/p';

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('MobbexConnector', () => {
  let connector: MobbexConnector;

  beforeEach(() => {
    connector = new MobbexConnector(CREDS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createCheckout', () => {
    it('sends POST to /checkout with correct payload', async () => {
      const spy = mockFetch({ id: 'mbx_1', url: 'https://mobbex.com/checkout/mbx_1', total: 1000, currency: 'ARS', reference: 'ord-1', status: 200, status_message: 'OK' });

      await connector.createCheckout({
        title: 'Test order',
        total: 1000,
        reference: 'ord-1',
        customer: { name: 'John Doe', email: 'john@test.com' },
      });

      const call = spy.mock.calls[0];
      expect(String(call[0])).toBe(`${BASE_URL}/checkout`);
      expect(call[1]?.method).toBe('POST');

      const body = JSON.parse(call[1]?.body as string);
      expect(body.title).toBe('Test order');
      expect(body.total).toBe(1000);
      expect(body.reference).toBe('ord-1');
      expect(body.customer.name).toBe('John Doe');
    });

    it('defaults currency to ARS', async () => {
      const spy = mockFetch({ id: 'mbx_2', url: 'https://mobbex.com/c', total: 500, currency: 'ARS', reference: 'r1', status: 200, status_message: 'OK' });
      await connector.createCheckout({ title: 'Test', total: 500, reference: 'r1' });
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.currency).toBe('ARS');
    });

    it('defaults timeout to 15 minutes', async () => {
      const spy = mockFetch({ id: 'mbx_3', url: 'https://mobbex.com/c', total: 100, currency: 'ARS', reference: 'r2', status: 200, status_message: 'OK' });
      await connector.createCheckout({ title: 'T', total: 100, reference: 'r2' });
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.timeout).toBe(15);
    });

    it('sends x-api-key and x-access-token headers', async () => {
      const spy = mockFetch({ id: 'mbx_4', url: 'https://mobbex.com/c', total: 100, currency: 'ARS', reference: 'r3', status: 200, status_message: 'OK' });
      await connector.createCheckout({ title: 'T', total: 100, reference: 'r3' });
      const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('test-api-key');
      expect(headers['x-access-token']).toBe('test-access-token');
    });

    it('includes items array (empty default)', async () => {
      const spy = mockFetch({ id: 'mbx_5', url: 'https://mobbex.com/c', total: 200, currency: 'ARS', reference: 'r4', status: 200, status_message: 'OK' });
      await connector.createCheckout({ title: 'T', total: 200, reference: 'r4' });
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(Array.isArray(body.items)).toBe(true);
    });
  });

  describe('getPayment', () => {
    it('sends GET to /payment/:id', async () => {
      const spy = mockFetch({ id: 'mbx_p1', status: 200, status_message: 'approved', total: 1000, currency: 'ARS', reference: 'r1', updated_at: '2024-01-01' });
      await connector.getPayment('mbx_p1');
      expect(String(spy.mock.calls[0][0])).toBe(`${BASE_URL}/payment/mbx_p1`);
      expect(spy.mock.calls[0][1]?.method).toBe('GET');
    });
  });

  describe('refundPayment', () => {
    it('sends POST to /payment/:id/refund', async () => {
      const spy = mockFetch({ id: 'mbx_p1', status: 'refunded' });
      await connector.refundPayment('mbx_p1', 500);
      const call = spy.mock.calls[0];
      expect(String(call[0])).toBe(`${BASE_URL}/payment/mbx_p1/refund`);
      expect(call[1]?.method).toBe('POST');
      const body = JSON.parse(call[1]?.body as string);
      expect(body.amount).toBe(500);
    });
  });

  describe('cancelPayment', () => {
    it('sends DELETE to /payment/:id', async () => {
      const spy = mockFetch({ id: 'mbx_p2', status: 'cancelled' });
      await connector.cancelPayment('mbx_p2');
      const call = spy.mock.calls[0];
      expect(String(call[0])).toBe(`${BASE_URL}/payment/mbx_p2`);
      expect(call[1]?.method).toBe('DELETE');
    });
  });

  describe('createSubscription', () => {
    it('sends POST to /subscription with interval and total', async () => {
      const spy = mockFetch({ id: 'sub_1', status: 'active', reference: 'sub-ref-1' });
      await connector.createSubscription({
        name: 'Monthly Plan',
        total: 2999,
        interval: 30,
        reference: 'sub-ref-1',
      });
      const call = spy.mock.calls[0];
      expect(String(call[0])).toBe(`${BASE_URL}/subscription`);
      const body = JSON.parse(call[1]?.body as string);
      expect(body.name).toBe('Monthly Plan');
      expect(body.total).toBe(2999);
      expect(body.interval).toBe(30);
      expect(body.currency).toBe('ARS');
    });
  });

  describe('cancelSubscription', () => {
    it('sends DELETE to /subscription/:id', async () => {
      const spy = mockFetch({ id: 'sub_1', status: 'cancelled' });
      await connector.cancelSubscription('sub_1');
      expect(String(spy.mock.calls[0][0])).toBe(`${BASE_URL}/subscription/sub_1`);
      expect(spy.mock.calls[0][1]?.method).toBe('DELETE');
    });
  });

  describe('error handling', () => {
    it('throws on non-2xx with message from response', async () => {
      mockFetch({ message: 'Invalid reference' }, 422);
      await expect(connector.createCheckout({ title: 'T', total: 100, reference: 'bad' })).rejects.toThrow('422');
    });
  });
});
