/**
 * MercadoPago Webhooks — Unit Tests (data-driven, mocked HTTP)
 *
 * Tests for:
 *  - verifyMercadoPagoSignature  (valid, invalid, edge cases)
 *  - normalizePaymentToOrderPaid (various payment shapes)
 *  - parseMercadoPagoWebhook     (different event types, non-payment events, fetch mock)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import {
  verifyMercadoPagoSignature,
  normalizePaymentToOrderPaid,
  parseMercadoPagoWebhook,
} from '../webhooks.js';
import { MercadoPagoConnector } from '../connector.js';
import type { Payment, WebhookEvent } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SECRET = 'webhook-secret-key-test';

function buildSignature(dataId: string, requestId: string, ts: string): string {
  const signedPayload = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac('sha256', SECRET).update(signedPayload).digest('hex');
}

function makeWebhookPayload(
  overrides: Partial<WebhookEvent> = {},
  headers: Record<string, string> = {}
) {
  const ts = '1700000000';
  const requestId = 'req-001';
  const dataId = overrides.data?.id ?? '12345';
  const sig = buildSignature(dataId, requestId, ts);

  const body: WebhookEvent = {
    id: 999,
    live_mode: false,
    type: 'payment',
    date_created: '2026-01-01T00:00:00.000Z',
    user_id: 123,
    api_version: 'v1',
    action: 'payment.created',
    data: { id: dataId },
    ...overrides,
  };

  return {
    headers: {
      'x-signature': `ts=${ts},v1=${sig}`,
      'x-request-id': requestId,
      ...headers,
    },
    body,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 100000001,
    status: 'approved',
    status_detail: 'accredited',
    date_created: '2026-01-01T10:00:00.000-03:00',
    date_approved: '2026-01-01T10:00:05.000-03:00',
    money_release_date: null,
    payment_method_id: 'visa',
    payment_type_id: 'credit_card',
    issuer_id: '1',
    installments: 1,
    transaction_amount: 5000,
    transaction_amount_refunded: 0,
    currency_id: 'ARS',
    description: 'Test',
    external_reference: 'EXT-001',
    statement_descriptor: null,
    payer: {
      id: 'PAY-1',
      email: 'buyer@example.com',
      identification: { type: 'DNI', number: '12345678' },
      first_name: 'Ana',
      last_name: 'García',
      phone: { area_code: '11', number: '98765432' },
    },
    additional_info: null,
    fee_details: [{ type: 'mercadopago_fee', amount: 200, fee_payer: 'collector' }],
    captured: true,
    live_mode: false,
    metadata: null,
    ...overrides,
  };
}

function mockFetchWithPayment(payment: Payment): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => payment,
      text: async () => JSON.stringify(payment),
    })
  );
}

const EXEC_CTX = { tenantId: 'tenant-webhook-test' };
const CREDS = { accessToken: 'TEST-WEBHOOK-TOKEN' };

let connector: MercadoPagoConnector;

beforeEach(() => {
  connector = new MercadoPagoConnector();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── verifyMercadoPagoSignature ───────────────────────────────────────────────

describe('verifyMercadoPagoSignature — valid signatures', () => {
  const cases: Array<[string, string, string]> = [
    ['12345', 'req-001', '1700000000'],
    ['99999', 'req-abc-xyz', '1700001234'],
    ['00001', 'req-zero', '1000000000'],
    ['987654321', 'req-large-id', '1999999999'],
    ['1', 'r', '1'],
  ];

  it.each(cases)('dataId=%s requestId=%s ts=%s', (dataId, requestId, ts) => {
    const v1 = buildSignature(dataId, requestId, ts);
    const payload = {
      headers: {
        'x-signature': `ts=${ts},v1=${v1}`,
        'x-request-id': requestId,
      },
      body: { data: { id: dataId } } as unknown as WebhookEvent,
    };

    expect(verifyMercadoPagoSignature(payload, SECRET)).toBe(true);
  });
});

describe('verifyMercadoPagoSignature — invalid signatures', () => {
  it('wrong hash returns false', () => {
    const payload = makeWebhookPayload();
    payload.headers['x-signature'] = 'ts=1700000000,v1=deadbeef0000';
    expect(verifyMercadoPagoSignature(payload, SECRET)).toBe(false);
  });

  it('tampered dataId returns false', () => {
    const payload = makeWebhookPayload({ data: { id: '12345' } });
    // Keep the signature but change the body's id
    (payload.body as WebhookEvent).data.id = '99999';
    expect(verifyMercadoPagoSignature(payload, SECRET)).toBe(false);
  });

  it('wrong secret returns false', () => {
    const payload = makeWebhookPayload({ data: { id: '12345' } });
    expect(verifyMercadoPagoSignature(payload, 'wrong-secret')).toBe(false);
  });

  it('missing x-signature header returns false', () => {
    const payload = makeWebhookPayload();
    const { 'x-signature': _, ...headersWithout } = payload.headers;
    expect(verifyMercadoPagoSignature({ ...payload, headers: headersWithout }, SECRET)).toBe(false);
  });

  it('missing x-request-id header returns false', () => {
    const payload = makeWebhookPayload();
    const { 'x-request-id': _, ...headersWithout } = payload.headers;
    expect(verifyMercadoPagoSignature({ ...payload, headers: headersWithout }, SECRET)).toBe(false);
  });

  it('malformed signature (no v1 part) returns false', () => {
    const payload = makeWebhookPayload();
    payload.headers['x-signature'] = 'ts=1700000000';
    expect(verifyMercadoPagoSignature(payload, SECRET)).toBe(false);
  });

  it('malformed signature (no ts part) returns false', () => {
    const payload = makeWebhookPayload();
    payload.headers['x-signature'] = 'v1=deadbeef';
    expect(verifyMercadoPagoSignature(payload, SECRET)).toBe(false);
  });

  it('completely malformed signature returns false', () => {
    const payload = makeWebhookPayload();
    payload.headers['x-signature'] = 'not-a-valid-signature';
    expect(verifyMercadoPagoSignature(payload, SECRET)).toBe(false);
  });

  it('empty signature header returns false', () => {
    const payload = makeWebhookPayload();
    payload.headers['x-signature'] = '';
    expect(verifyMercadoPagoSignature(payload, SECRET)).toBe(false);
  });
});

// ─── normalizePaymentToOrderPaid ──────────────────────────────────────────────

describe('normalizePaymentToOrderPaid — currencies', () => {
  const currencyCases: Array<[string, number]> = [
    ['ARS', 10000],
    ['BRL', 500],
    ['MXN', 1500],
    ['CLP', 80000],
    ['COP', 200000],
    ['PEN', 1000],
    ['UYU', 5000],
  ];

  it.each(currencyCases)('currency=%s amount=%s', (currency_id, transaction_amount) => {
    const payment = makePayment({ currency_id, transaction_amount });
    const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
    const payload = event.payload as Record<string, unknown>;

    expect(payload.currency).toBe(currency_id);
    expect(payload.amount).toBe(transaction_amount);
  });
});

describe('normalizePaymentToOrderPaid — payment methods mapping', () => {
  const mappingCases: Array<[string, string]> = [
    ['credit_card', 'credit_card'],
    ['debit_card', 'debit_card'],
    ['account_money', 'account_money'],
    ['bank_transfer', 'bank_transfer'],
    ['ticket', 'cash'],
    ['atm', 'cash'],
    ['unknown_method', 'other'],
  ];

  it.each(mappingCases)('payment_type_id=%s → %s', (payment_type_id, expected) => {
    const payment = makePayment({ payment_type_id });
    const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
    const payload = event.payload as Record<string, unknown>;

    expect(payload.payment_method).toBe(expected);
  });
});

describe('normalizePaymentToOrderPaid — fee calculation', () => {
  it.each([
    [1000, 50, 950],
    [5000, 200, 4800],
    [0, 0, 0],
    [100, 0, 100],
    [9999.99, 999.99, 9000],
  ] as Array<[number, number, number]>)(
    'amount=%s fee=%s net=%s',
    (transaction_amount, fee, net_amount) => {
      const payment = makePayment({
        transaction_amount,
        fee_details: fee > 0 ? [{ type: 'mp_fee', amount: fee, fee_payer: 'collector' }] : [],
      });
      const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
      const payload = event.payload as Record<string, unknown>;

      expect(payload.fee_amount).toBe(fee);
      expect(payload.net_amount).toBeCloseTo(net_amount, 5);
    }
  );
});

describe('normalizePaymentToOrderPaid — correlation ID', () => {
  it.each([
    ['EXT-REF-001', 'mp-EXT-REF-001'],
    ['ORDER-2026-0101', 'mp-ORDER-2026-0101'],
    [null, 'mp-100000001'],
    [undefined, 'mp-100000001'],
  ] as Array<[string | null | undefined, string]>)(
    'external_reference=%s → correlationId=%s',
    (external_reference, expectedCorrelation) => {
      const payment = makePayment({ external_reference: external_reference ?? null });
      const event = normalizePaymentToOrderPaid(payment, 'tenant-x');

      expect(event.correlationId).toBe(expectedCorrelation);
    }
  );
});

describe('normalizePaymentToOrderPaid — customer info', () => {
  it('customer from payer data', () => {
    const payment = makePayment({
      payer: {
        id: 'PAYER-XYZ',
        email: 'test@test.com',
        identification: { type: 'CUIT', number: '20123456789' },
        first_name: 'Carlos',
        last_name: 'López',
        phone: { area_code: '351', number: '1234567' },
      },
    });
    const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
    const payload = event.payload as Record<string, unknown>;
    const customer = payload.customer as Record<string, unknown>;

    expect(customer.id).toBe('PAYER-XYZ');
    expect(customer.email).toBe('test@test.com');
    expect(customer.first_name).toBe('Carlos');
    expect(customer.last_name).toBe('López');
    expect(customer.phone).toBe('3511234567');
  });

  it('customer without phone', () => {
    const payment = makePayment({
      payer: {
        id: null,
        email: 'noPhone@test.com',
        identification: null,
        first_name: null,
        last_name: null,
        phone: null,
      },
    });
    const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
    const payload = event.payload as Record<string, unknown>;
    const customer = payload.customer as Record<string, unknown>;

    expect(customer.phone).toBeUndefined();
    expect(customer.identification).toBeUndefined();
  });
});

describe('normalizePaymentToOrderPaid — items from additional_info', () => {
  it('maps items from additional_info.items', () => {
    const payment = makePayment({
      additional_info: {
        items: [
          { id: 'PROD-1', title: 'Widget', description: 'A widget', quantity: 2, unit_price: 500 },
          { id: 'PROD-2', title: 'Gadget', description: null, quantity: 1, unit_price: 1000 },
        ],
        payer: null,
        shipments: null,
      },
    });
    const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
    const payload = event.payload as Record<string, unknown>;
    const items = payload.items as Array<Record<string, unknown>>;

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('PROD-1');
    expect(items[1].quantity).toBe(1);
  });

  it('returns empty items when no additional_info', () => {
    const payment = makePayment({ additional_info: null });
    const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
    const payload = event.payload as Record<string, unknown>;
    expect(payload.items).toEqual([]);
  });
});

describe('normalizePaymentToOrderPaid — shipping', () => {
  it('maps shipping address', () => {
    const payment = makePayment({
      additional_info: {
        items: undefined,
        payer: null,
        shipments: {
          receiver_address: {
            street_name: 'Av. Rivadavia',
            street_number: '5000',
            zip_code: 'C1424',
            city_name: 'Buenos Aires',
            state_name: 'CABA',
          },
        },
      },
    });
    const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
    const payload = event.payload as Record<string, unknown>;
    const shipping = payload.shipping as Record<string, unknown>;
    const address = shipping?.address as Record<string, unknown>;

    expect(address).toBeDefined();
    expect(address.city).toBe('Buenos Aires');
  });

  it('no shipping when no shipments', () => {
    const payment = makePayment({
      additional_info: { items: undefined, payer: null, shipments: null },
    });
    const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
    const payload = event.payload as Record<string, unknown>;
    expect(payload.shipping).toBeUndefined();
  });
});

describe('normalizePaymentToOrderPaid — metadata', () => {
  it('merges payment metadata into event metadata', () => {
    const payment = makePayment({
      metadata: { custom_key: 'custom_val', order_system: 'WMS' },
      payment_method_id: 'mastercard',
    });
    const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
    const payload = event.payload as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;

    expect(metadata.custom_key).toBe('custom_val');
    expect(metadata.order_system).toBe('WMS');
    expect(metadata.mp_payment_method_id).toBe('mastercard');
  });

  it('handles null metadata gracefully', () => {
    const payment = makePayment({ metadata: null });
    const event = normalizePaymentToOrderPaid(payment, 'tenant-x');
    const payload = event.payload as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;

    expect(metadata.mp_payment_id).toBeDefined();
  });
});

// ─── parseMercadoPagoWebhook ──────────────────────────────────────────────────

describe('parseMercadoPagoWebhook — non-payment events return null', () => {
  const nonPaymentTypes = ['merchant_order', 'point_integration_wh', 'subscription_preapproval', 'plan', 'subscription_authorized_payment'];

  it.each(nonPaymentTypes)('type=%s → null', async (type) => {
    const payload = makeWebhookPayload({ type });
    const result = await parseMercadoPagoWebhook(connector, payload, EXEC_CTX, CREDS);
    expect(result).toBeNull();
  });
});

describe('parseMercadoPagoWebhook — payment events', () => {
  it('approved payment emits business.order.paid event', async () => {
    const payment = makePayment({ status: 'approved' });
    mockFetchWithPayment(payment);

    const payload = makeWebhookPayload({ data: { id: String(payment.id) } });
    const result = await parseMercadoPagoWebhook(connector, payload, EXEC_CTX, CREDS);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('business.order.paid');
    expect(result?.source).toBe('mercadopago');
    expect(result?.tenantId).toBe('tenant-webhook-test');
  });

  it('pending payment returns null (not approved)', async () => {
    const payment = makePayment({ status: 'pending' });
    mockFetchWithPayment(payment);

    const payload = makeWebhookPayload({ data: { id: String(payment.id) } });
    const result = await parseMercadoPagoWebhook(connector, payload, EXEC_CTX, CREDS);

    expect(result).toBeNull();
  });

  it('rejected payment returns null', async () => {
    const payment = makePayment({ status: 'rejected' });
    mockFetchWithPayment(payment);

    const payload = makeWebhookPayload({ data: { id: String(payment.id) } });
    const result = await parseMercadoPagoWebhook(connector, payload, EXEC_CTX, CREDS);

    expect(result).toBeNull();
  });

  it('in_mediation payment returns null', async () => {
    const payment = makePayment({ status: 'in_mediation' });
    mockFetchWithPayment(payment);

    const payload = makeWebhookPayload({ data: { id: String(payment.id) } });
    const result = await parseMercadoPagoWebhook(connector, payload, EXEC_CTX, CREDS);

    expect(result).toBeNull();
  });

  it('fetch error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('FETCH_FAILED')));

    const payload = makeWebhookPayload({ data: { id: '999' } });
    await expect(
      parseMercadoPagoWebhook(connector, payload, EXEC_CTX, CREDS)
    ).rejects.toThrow();
  });

  it('approved payment with items in payload', async () => {
    const payment = makePayment({
      status: 'approved',
      additional_info: {
        items: [{ id: 'SKU-1', title: 'Producto A', description: null, quantity: 3, unit_price: 200 }],
        payer: null,
        shipments: null,
      },
    });
    mockFetchWithPayment(payment);

    const payload = makeWebhookPayload({ data: { id: String(payment.id) } });
    const result = await parseMercadoPagoWebhook(connector, payload, EXEC_CTX, CREDS);

    expect(result).not.toBeNull();
    const eventPayload = result!.payload as Record<string, unknown>;
    const items = eventPayload.items as Array<unknown>;
    expect(items).toHaveLength(1);
  });
});

describe('parseMercadoPagoWebhook — event structure', () => {
  it('includes version 1.0.0', async () => {
    const payment = makePayment({ status: 'approved' });
    mockFetchWithPayment(payment);

    const payload = makeWebhookPayload({ data: { id: String(payment.id) } });
    const result = await parseMercadoPagoWebhook(connector, payload, EXEC_CTX, CREDS);

    expect(result?.version).toBe('1.0.0');
  });

  it('eventId is a UUID string', async () => {
    const payment = makePayment({ status: 'approved' });
    mockFetchWithPayment(payment);

    const payload = makeWebhookPayload({ data: { id: String(payment.id) } });
    const result = await parseMercadoPagoWebhook(connector, payload, EXEC_CTX, CREDS);

    expect(result?.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('occurredAt is a Date', async () => {
    const payment = makePayment({ status: 'approved' });
    mockFetchWithPayment(payment);

    const payload = makeWebhookPayload({ data: { id: String(payment.id) } });
    const result = await parseMercadoPagoWebhook(connector, payload, EXEC_CTX, CREDS);

    expect(result?.occurredAt).toBeInstanceOf(Date);
  });
});
