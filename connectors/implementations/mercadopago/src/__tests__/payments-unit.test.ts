/**
 * MercadoPago Payments — Unit Tests (data-driven, mocked HTTP)
 *
 * Tests for get_payment, search_payments, and refund_payment actions.
 * All HTTP calls are mocked via vi.stubGlobal.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MercadoPagoConnector } from '../connector.js';
import type { Payment, Refund } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 100000001,
    status: 'approved',
    status_detail: 'accredited',
    date_created: '2026-01-01T10:00:00.000-03:00',
    date_approved: '2026-01-01T10:00:05.000-03:00',
    money_release_date: '2026-01-15T00:00:00.000-03:00',
    payment_method_id: 'visa',
    payment_type_id: 'credit_card',
    issuer_id: '1',
    installments: 1,
    transaction_amount: 1000,
    transaction_amount_refunded: 0,
    currency_id: 'ARS',
    description: 'Test payment',
    external_reference: 'EXT-001',
    statement_descriptor: 'TEST STORE',
    payer: {
      id: 'PAYER-1',
      email: 'buyer@test.com',
      identification: { type: 'DNI', number: '12345678' },
      first_name: 'John',
      last_name: 'Doe',
      phone: { area_code: '11', number: '12345678' },
    },
    additional_info: null,
    fee_details: [{ type: 'mercadopago_fee', amount: 50, fee_payer: 'collector' }],
    captured: true,
    live_mode: false,
    metadata: null,
    ...overrides,
  };
}

function mockFetchOk(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status,
      headers: new Headers(),
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
  );
}

function mockFetchError(status: number, message = 'Error'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      headers: new Headers({ 'Retry-After': '60' }),
      json: async () => ({ message }),
      text: async () => JSON.stringify({ message }),
    })
  );
}

function mockFetchNetworkError(errMsg = 'Network failure'): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(errMsg)));
}

const CONTEXT = {
  tenantId: 'tenant-test',
  correlationId: 'corr-test',
};

const CREDENTIALS = { accessToken: 'TEST-TOKEN-12345' };

let connector: MercadoPagoConnector;

beforeEach(() => {
  connector = new MercadoPagoConnector();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── get_payment: different statuses ─────────────────────────────────────────

describe('get_payment — statuses', () => {
  const statusCases: Array<[Payment['status'], string]> = [
    ['approved', 'accredited'],
    ['pending', 'pending_waiting_payment'],
    ['rejected', 'cc_rejected_insufficient_amount'],
    ['cancelled', 'expired'],
    ['refunded', 'refunded'],
    ['in_process', 'pending_review_manual'],
    ['in_mediation', 'in_mediation'],
    ['charged_back', 'charged_back'],
  ];

  it.each(statusCases)('status=%s detail=%s', async (status, status_detail) => {
    const payment = makePayment({ id: 111, status, status_detail });
    mockFetchOk(payment);

    const result = await connector.executeAction<Payment>({
      actionId: 'get_payment',
      params: { paymentId: 111 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe(status);
    expect(result.data?.status_detail).toBe(status_detail);
  });
});

// ─── get_payment: different currencies ───────────────────────────────────────

describe('get_payment — currencies', () => {
  const currencyCases: Array<[string, number]> = [
    ['ARS', 15000.50],
    ['BRL', 300.00],
    ['MXN', 500.00],
    ['CLP', 120000],
    ['COP', 250000],
    ['PEN', 850.00],
    ['UYU', 2500.00],
  ];

  it.each(currencyCases)('currency=%s amount=%s', async (currency_id, transaction_amount) => {
    const payment = makePayment({ id: 200, currency_id, transaction_amount });
    mockFetchOk(payment);

    const result = await connector.executeAction<Payment>({
      actionId: 'get_payment',
      params: { paymentId: 200 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    expect(result.data?.currency_id).toBe(currency_id);
    expect(result.data?.transaction_amount).toBe(transaction_amount);
  });
});

// ─── get_payment: different payment methods ───────────────────────────────────

describe('get_payment — payment methods', () => {
  const methodCases: Array<[string, string]> = [
    ['credit_card', 'visa'],
    ['debit_card', 'master'],
    ['account_money', 'account_money'],
    ['ticket', 'bolbradesco'],
    ['bank_transfer', 'pix'],
  ];

  it.each(methodCases)(
    'payment_type=%s method=%s',
    async (payment_type_id, payment_method_id) => {
      const payment = makePayment({ id: 300, payment_type_id, payment_method_id });
      mockFetchOk(payment);

      const result = await connector.executeAction<Payment>({
        actionId: 'get_payment',
        params: { paymentId: 300 },
        context: CONTEXT,
        credentials: CREDENTIALS,
      });

      expect(result.success).toBe(true);
      expect(result.data?.payment_type_id).toBe(payment_type_id);
      expect(result.data?.payment_method_id).toBe(payment_method_id);
    }
  );
});

// ─── get_payment: edge amounts ────────────────────────────────────────────────

describe('get_payment — edge amounts', () => {
  const amountCases: Array<[string, number]> = [
    ['minimal', 0.01],
    ['typical', 15000.5],
    ['large', 9999999.99],
    ['zero', 0],
  ];

  it.each(amountCases)('amount label=%s value=%s', async (label, transaction_amount) => {
    const payment = makePayment({ id: 400, transaction_amount });
    mockFetchOk(payment);

    const result = await connector.executeAction<Payment>({
      actionId: 'get_payment',
      params: { paymentId: 400 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    expect(result.data?.transaction_amount).toBe(transaction_amount);
  });
});

// ─── get_payment: HTTP error cases ───────────────────────────────────────────

describe('get_payment — HTTP errors', () => {
  it('401 Unauthorized returns failure', async () => {
    mockFetchError(401, 'Unauthorized');
    const result = await connector.executeAction({
      actionId: 'get_payment',
      params: { paymentId: 999 },
      context: CONTEXT,
      credentials: { accessToken: 'INVALID-TOKEN' },
    });
    expect(result.success).toBe(false);
  });

  it('404 Not Found returns failure', async () => {
    mockFetchError(404, 'Not Found');
    const result = await connector.executeAction({
      actionId: 'get_payment',
      params: { paymentId: 99999999 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
  });

  it('429 Rate Limit returns failure', async () => {
    // Use Retry-After: 0 so SDK retries are instant (no real sleep)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '0' }),
        json: async () => ({ message: 'Too Many Requests' }),
        text: async () => '{"message":"Too Many Requests"}',
      })
    );
    const result = await connector.executeAction({
      actionId: 'get_payment',
      params: { paymentId: 123 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
  }, 15000);

  it('500 Server Error returns failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ message: 'Internal Server Error' }),
        text: async () => '{"message":"Internal Server Error"}',
      })
    );
    const result = await connector.executeAction({
      actionId: 'get_payment',
      params: { paymentId: 123 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
  });

  it('Network timeout returns failure', async () => {
    mockFetchNetworkError('ETIMEDOUT: connection timed out');
    const result = await connector.executeAction({
      actionId: 'get_payment',
      params: { paymentId: 123 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
  });
});

// ─── get_payment: installments ───────────────────────────────────────────────

describe('get_payment — installments', () => {
  const installmentCases = [1, 3, 6, 12, 18, 24];

  it.each(installmentCases)('%i installments', async (installments) => {
    const payment = makePayment({ id: 500, installments, transaction_amount: 12000 });
    mockFetchOk(payment);

    const result = await connector.executeAction<Payment>({
      actionId: 'get_payment',
      params: { paymentId: 500 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    expect(result.data?.installments).toBe(installments);
  });
});

// ─── search_payments ──────────────────────────────────────────────────────────

describe('search_payments', () => {
  function makePagingResponse(
    results: Payment[],
    total = results.length,
    offset = 0,
    limit = 30
  ) {
    return { results, paging: { total, offset, limit } };
  }

  it.each([
    ['approved', '2026-01-01T00:00:00', '2026-01-31T23:59:59', 10, 0],
    ['pending', '2026-02-01T00:00:00', '2026-02-28T23:59:59', 20, 0],
    ['rejected', '2026-03-01T00:00:00', '2026-03-31T23:59:59', 30, 0],
    ['cancelled', '2026-04-01T00:00:00', '2026-04-30T23:59:59', 15, 0],
    ['refunded', '2026-05-01T00:00:00', '2026-05-31T23:59:59', 5, 0],
  ] as Array<[Payment['status'], string, string, number, number]>)(
    'filter by status=%s dateFrom=%s',
    async (status, dateFrom, dateTo, limit, offset) => {
      const results = [makePayment({ status })];
      mockFetchOk(makePagingResponse(results, 1, offset, limit));

      const result = await connector.executeAction({
        actionId: 'search_payments',
        params: { status, dateFrom, dateTo, limit, offset },
        context: CONTEXT,
        credentials: CREDENTIALS,
      });

      expect(result.success).toBe(true);
      const data = result.data as { results: Payment[]; paging: { total: number } };
      expect(data.results[0].status).toBe(status);
    }
  );

  it.each([
    ['ORDER-001', 1],
    ['ORDER-002', 5],
    ['ORDER-003', 0],
    ['ORD-SPECIAL-ABC', 2],
    ['REF-2026-0101', 10],
  ])('filter by externalReference=%s expects %i results', async (externalReference, total) => {
    const results = Array.from({ length: total }, (_, i) =>
      makePayment({ id: 600 + i, external_reference: externalReference })
    );
    mockFetchOk(makePagingResponse(results, total));

    const result = await connector.executeAction({
      actionId: 'search_payments',
      params: { externalReference, limit: 30, offset: 0 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    const data = result.data as { results: Payment[]; paging: { total: number } };
    expect(data.paging.total).toBe(total);
  });

  it.each([
    [1, 10, 0],
    [10, 20, 10],
    [100, 100, 0],
    [5, 5, 0],
    [30, 30, 30],
  ])('paging: total=%i limit=%i offset=%i', async (total, limit, offset) => {
    const count = Math.min(limit, total - offset);
    const results = Array.from({ length: count }, (_, i) =>
      makePayment({ id: 700 + i + offset })
    );
    mockFetchOk(makePagingResponse(results, total, offset, limit));

    const result = await connector.executeAction({
      actionId: 'search_payments',
      params: { limit, offset },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    const data = result.data as { results: Payment[]; paging: { total: number; offset: number; limit: number } };
    expect(data.paging.limit).toBe(limit);
    expect(data.paging.offset).toBe(offset);
    expect(data.paging.total).toBe(total);
  });

  it('search returns empty results', async () => {
    mockFetchOk(makePagingResponse([], 0));
    const result = await connector.executeAction({
      actionId: 'search_payments',
      params: { externalReference: 'NOT-FOUND', limit: 30, offset: 0 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(true);
    const data = result.data as { results: Payment[] };
    expect(data.results).toHaveLength(0);
  });

  it('search with no filters returns all payments', async () => {
    const results = Array.from({ length: 30 }, (_, i) => makePayment({ id: 800 + i }));
    mockFetchOk(makePagingResponse(results, 150, 0, 30));
    const result = await connector.executeAction({
      actionId: 'search_payments',
      params: { limit: 30, offset: 0 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(true);
    const data = result.data as { results: Payment[]; paging: { total: number } };
    expect(data.paging.total).toBe(150);
    expect(data.results).toHaveLength(30);
  });

  it('search 500 error returns failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({}),
        text: async () => '{}',
      })
    );
    const result = await connector.executeAction({
      actionId: 'search_payments',
      params: { limit: 30, offset: 0 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
  });

  it('search 401 error returns failure', async () => {
    mockFetchError(401, 'Unauthorized');
    const result = await connector.executeAction({
      actionId: 'search_payments',
      params: { limit: 30, offset: 0 },
      context: CONTEXT,
      credentials: { accessToken: 'BAD-TOKEN' },
    });
    expect(result.success).toBe(false);
  });

  it('search network error returns failure', async () => {
    mockFetchNetworkError('ECONNREFUSED');
    const result = await connector.executeAction({
      actionId: 'search_payments',
      params: { limit: 10, offset: 0 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
  });
});

// ─── refund_payment ───────────────────────────────────────────────────────────

describe('refund_payment', () => {
  function makeRefund(overrides: Partial<Refund> = {}): Refund {
    return {
      id: 900000,
      payment_id: 100000001,
      amount: 1000,
      status: 'approved',
      date_created: '2026-01-10T12:00:00.000-03:00',
      ...overrides,
    };
  }

  it.each([
    [100000001, undefined, 1000, 'full refund — no amount specified'],
    [100000002, 500, 500, 'partial refund 500'],
    [100000003, 250.5, 250.5, 'partial refund 250.5'],
    [100000004, 1, 1, 'minimal partial refund'],
    [100000005, 9999, 9999, 'large partial refund'],
  ] as Array<[number, number | undefined, number, string]>)(
    'paymentId=%i amount=%s → refundAmount=%s (%s)',
    async (paymentId, amount, expectedAmount, _label) => {
      const refund = makeRefund({ payment_id: paymentId, amount: expectedAmount });
      mockFetchOk(refund);

      const result = await connector.executeAction<Refund>({
        actionId: 'refund_payment',
        params: { paymentId, amount },
        context: CONTEXT,
        credentials: CREDENTIALS,
      });

      expect(result.success).toBe(true);
      expect(result.data?.amount).toBe(expectedAmount);
      expect(result.data?.payment_id).toBe(paymentId);
    }
  );

  it('full refund has status=approved', async () => {
    const refund = makeRefund({ status: 'approved' });
    mockFetchOk(refund);

    const result = await connector.executeAction<Refund>({
      actionId: 'refund_payment',
      params: { paymentId: 100000001 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('approved');
  });

  it('already refunded returns API error (422)', async () => {
    mockFetchError(422, 'Payment already refunded');
    const result = await connector.executeAction({
      actionId: 'refund_payment',
      params: { paymentId: 100000001 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
  });

  it('payment not found returns failure (404)', async () => {
    mockFetchError(404, 'Payment not found');
    const result = await connector.executeAction({
      actionId: 'refund_payment',
      params: { paymentId: 9999999 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
  });

  it('invalid token returns 401', async () => {
    mockFetchError(401, 'Unauthorized');
    const result = await connector.executeAction({
      actionId: 'refund_payment',
      params: { paymentId: 100000001 },
      context: CONTEXT,
      credentials: { accessToken: 'BAD' },
    });
    expect(result.success).toBe(false);
  });

  it('network failure returns failure', async () => {
    mockFetchNetworkError('ETIMEDOUT');
    const result = await connector.executeAction({
      actionId: 'refund_payment',
      params: { paymentId: 100000001 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
  });

  it('server error 503 returns failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        json: async () => ({ message: 'Service Unavailable' }),
        text: async () => '{}',
      })
    );
    const result = await connector.executeAction({
      actionId: 'refund_payment',
      params: { paymentId: 100000001 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
  });

  it.each([
    [100000010, 100.25],
    [100000011, 333.33],
    [100000012, 999.99],
  ])('partial refund paymentId=%i amount=%s', async (paymentId, amount) => {
    const refund = makeRefund({ payment_id: paymentId, amount });
    mockFetchOk(refund);
    const result = await connector.executeAction<Refund>({
      actionId: 'refund_payment',
      params: { paymentId, amount },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(true);
    expect(result.data?.amount).toBe(amount);
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe('input validation', () => {
  it('missing accessToken causes failure', async () => {
    const result = await connector.executeAction({
      actionId: 'get_payment',
      params: { paymentId: 123 },
      context: CONTEXT,
      credentials: {},
    });
    expect(result.success).toBe(false);
  });

  it('invalid paymentId type accepted as string', async () => {
    const payment = makePayment({ id: 12345 });
    mockFetchOk(payment);
    const result = await connector.executeAction<Payment>({
      actionId: 'get_payment',
      params: { paymentId: '12345' },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(true);
  });

  it('negative refund amount fails validation', async () => {
    const result = await connector.executeAction({
      actionId: 'refund_payment',
      params: { paymentId: 123, amount: -100 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });

  it('search with limit > 100 fails validation', async () => {
    const result = await connector.executeAction({
      actionId: 'search_payments',
      params: { limit: 101, offset: 0 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });

  it('search with negative offset fails validation', async () => {
    const result = await connector.executeAction({
      actionId: 'search_payments',
      params: { limit: 10, offset: -1 },
      context: CONTEXT,
      credentials: CREDENTIALS,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });
});
