import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  normalizePaymentToOrderPaid,
  verifyMercadoPagoSignature,
} from '../webhooks.js';
import type { Payment } from '../types.js';

describe('normalizePaymentToOrderPaid', () => {
  const mockPayment: Payment = {
    id: 12345678901,
    status: 'approved',
    status_detail: 'accredited',
    date_created: '2024-01-15T10:30:00.000-03:00',
    date_approved: '2024-01-15T10:30:15.000-03:00',
    money_release_date: '2024-01-30T00:00:00.000-03:00',
    payment_method_id: 'visa',
    payment_type_id: 'credit_card',
    issuer_id: '123',
    installments: 1,
    transaction_amount: 15000,
    transaction_amount_refunded: 0,
    currency_id: 'ARS',
    description: 'Compra en ACME Store',
    external_reference: 'ORDER-456',
    statement_descriptor: 'ACME STORE',
    payer: {
      id: 'PAYER-123',
      email: 'juan@example.com',
      identification: {
        type: 'DNI',
        number: '30123456',
      },
      first_name: 'Juan',
      last_name: 'Pérez',
      phone: {
        area_code: '11',
        number: '12345678',
      },
    },
    additional_info: {
      items: [
        {
          id: 'ITEM-001',
          title: 'Widget Premium',
          description: 'Un widget de alta calidad',
          quantity: 2,
          unit_price: 7500,
        },
      ],
      payer: {
        first_name: 'Juan',
        last_name: 'Pérez',
      },
      shipments: {
        receiver_address: {
          street_name: 'Av. Corrientes',
          street_number: '1234',
          zip_code: 'C1043AAZ',
          city_name: 'Buenos Aires',
          state_name: 'CABA',
        },
      },
    },
    fee_details: [
      {
        type: 'mercadopago_fee',
        amount: 750,
        fee_payer: 'collector',
      },
    ],
    captured: true,
    live_mode: true,
    metadata: {
      custom_field: 'custom_value',
    },
  };

  it('should normalize payment to order.paid event', () => {
    const event = normalizePaymentToOrderPaid(mockPayment, 'tenant-123');

    expect(event.eventType).toBe('business.order.paid');
    expect(event.source).toBe('mercadopago');
    expect(event.tenantId).toBe('tenant-123');
    expect(event.version).toBe('1.0.0');
  });

  it('should include correct payment info', () => {
    const event = normalizePaymentToOrderPaid(mockPayment, 'tenant-123');
    const payload = event.payload as Record<string, unknown>;

    expect(payload.order_id).toBe('MP-12345678901');
    expect(payload.payment_id).toBe('12345678901');
    expect(payload.amount).toBe(15000);
    expect(payload.currency).toBe('ARS');
    expect(payload.installments).toBe(1);
    expect(payload.payment_method).toBe('credit_card');
  });

  it('should calculate net amount correctly', () => {
    const event = normalizePaymentToOrderPaid(mockPayment, 'tenant-123');
    const payload = event.payload as Record<string, unknown>;

    expect(payload.fee_amount).toBe(750);
    expect(payload.net_amount).toBe(14250); // 15000 - 750
  });

  it('should include customer info', () => {
    const event = normalizePaymentToOrderPaid(mockPayment, 'tenant-123');
    const payload = event.payload as Record<string, unknown>;
    const customer = payload.customer as Record<string, unknown>;

    expect(customer.id).toBe('PAYER-123');
    expect(customer.email).toBe('juan@example.com');
    expect(customer.first_name).toBe('Juan');
    expect(customer.last_name).toBe('Pérez');
    expect(customer.phone).toBe('1112345678');
  });

  it('should include customer identification', () => {
    const event = normalizePaymentToOrderPaid(mockPayment, 'tenant-123');
    const payload = event.payload as Record<string, unknown>;
    const customer = payload.customer as Record<string, unknown>;
    const identification = customer.identification as Record<string, unknown>;

    expect(identification.type).toBe('DNI');
    expect(identification.number).toBe('30123456');
  });

  it('should include items', () => {
    const event = normalizePaymentToOrderPaid(mockPayment, 'tenant-123');
    const payload = event.payload as Record<string, unknown>;
    const items = payload.items as Array<Record<string, unknown>>;

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('ITEM-001');
    expect(items[0].title).toBe('Widget Premium');
    expect(items[0].quantity).toBe(2);
    expect(items[0].unit_price).toBe(7500);
  });

  it('should include shipping address', () => {
    const event = normalizePaymentToOrderPaid(mockPayment, 'tenant-123');
    const payload = event.payload as Record<string, unknown>;
    const shipping = payload.shipping as Record<string, unknown>;
    const address = shipping.address as Record<string, unknown>;

    expect(address.street_name).toBe('Av. Corrientes');
    expect(address.street_number).toBe('1234');
    expect(address.city).toBe('Buenos Aires');
    expect(address.state).toBe('CABA');
    expect(address.zip_code).toBe('C1043AAZ');
  });

  it('should include metadata', () => {
    const event = normalizePaymentToOrderPaid(mockPayment, 'tenant-123');
    const payload = event.payload as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;

    expect(metadata.mp_payment_id).toBe(12345678901);
    expect(metadata.mp_status_detail).toBe('accredited');
    expect(metadata.mp_payment_method_id).toBe('visa');
    expect(metadata.live_mode).toBe(true);
    expect(metadata.custom_field).toBe('custom_value');
  });

  it('should generate correlation ID from external_reference', () => {
    const event = normalizePaymentToOrderPaid(mockPayment, 'tenant-123');

    expect(event.correlationId).toBe('mp-ORDER-456');
  });

  it('should use payment ID for correlation when no external_reference', () => {
    const paymentWithoutRef = { ...mockPayment, external_reference: null };
    const event = normalizePaymentToOrderPaid(paymentWithoutRef, 'tenant-123');

    expect(event.correlationId).toBe('mp-12345678901');
  });

  it('should handle payment without additional_info', () => {
    const simplePayment: Payment = {
      ...mockPayment,
      additional_info: null,
    };

    const event = normalizePaymentToOrderPaid(simplePayment, 'tenant-123');
    const payload = event.payload as Record<string, unknown>;

    expect(payload.items).toEqual([]);
    expect(payload.shipping).toBeUndefined();
  });
});

describe('verifyMercadoPagoSignature', () => {
  const webhookSecret = 'test-secret-key';

  it('should verify valid signature', () => {
    const dataId = '12345678901';
    const requestId = 'req-uuid-123';
    const ts = '1705320615';

    // Build the signed payload as MercadoPago does
    const signedPayload = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    const payload = {
      headers: {
        'x-signature': `ts=${ts},v1=${expectedSignature}`,
        'x-request-id': requestId,
      },
      body: {
        id: 999,
        live_mode: true,
        type: 'payment',
        date_created: '2024-01-15',
        user_id: 123,
        api_version: 'v1',
        action: 'payment.created',
        data: { id: dataId },
      },
    };

    const result = verifyMercadoPagoSignature(payload, webhookSecret);

    expect(result).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = {
      headers: {
        'x-signature': 'ts=1705320615,v1=invalid_signature_hash',
        'x-request-id': 'req-uuid-123',
      },
      body: {
        id: 999,
        live_mode: true,
        type: 'payment',
        date_created: '2024-01-15',
        user_id: 123,
        api_version: 'v1',
        action: 'payment.created',
        data: { id: '12345678901' },
      },
    };

    const result = verifyMercadoPagoSignature(payload, webhookSecret);

    expect(result).toBe(false);
  });

  it('should reject missing signature header', () => {
    const payload = {
      headers: {
        'x-request-id': 'req-uuid-123',
      },
      body: {
        data: { id: '12345678901' },
      },
    };

    const result = verifyMercadoPagoSignature(payload, webhookSecret);

    expect(result).toBe(false);
  });

  it('should reject missing request-id header', () => {
    const payload = {
      headers: {
        'x-signature': 'ts=1705320615,v1=some_hash',
      },
      body: {
        data: { id: '12345678901' },
      },
    };

    const result = verifyMercadoPagoSignature(payload, webhookSecret);

    expect(result).toBe(false);
  });

  it('should reject malformed signature header', () => {
    const payload = {
      headers: {
        'x-signature': 'invalid-format',
        'x-request-id': 'req-uuid-123',
      },
      body: {
        data: { id: '12345678901' },
      },
    };

    const result = verifyMercadoPagoSignature(payload, webhookSecret);

    expect(result).toBe(false);
  });
});
