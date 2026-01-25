import { describe, it, expect } from 'vitest';
import {
  MercadoPagoAuthSchema,
  MercadoPagoConfigSchema,
  PaymentStatusSchema,
  GetPaymentInputSchema,
  SearchPaymentsInputSchema,
  RefundPaymentInputSchema,
  WebhookEventSchema,
} from '../types.js';

describe('MercadoPagoAuthSchema', () => {
  it('should validate correct auth', () => {
    const result = MercadoPagoAuthSchema.safeParse({
      accessToken: 'APP_USR-1234567890123456-010101-abcdef1234567890abcdef12345678901234-12345678',
    });

    expect(result.success).toBe(true);
  });

  it('should reject empty access token', () => {
    const result = MercadoPagoAuthSchema.safeParse({
      accessToken: '',
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing access token', () => {
    const result = MercadoPagoAuthSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});

describe('MercadoPagoConfigSchema', () => {
  it('should validate complete config', () => {
    const result = MercadoPagoConfigSchema.safeParse({
      environment: 'production',
      webhookSecret: 'my-secret',
    });

    expect(result.success).toBe(true);
  });

  it('should default to sandbox environment', () => {
    const result = MercadoPagoConfigSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.environment).toBe('sandbox');
    }
  });

  it('should reject invalid environment', () => {
    const result = MercadoPagoConfigSchema.safeParse({
      environment: 'invalid',
    });

    expect(result.success).toBe(false);
  });
});

describe('PaymentStatusSchema', () => {
  const validStatuses = [
    'pending',
    'approved',
    'authorized',
    'in_process',
    'in_mediation',
    'rejected',
    'cancelled',
    'refunded',
    'charged_back',
  ];

  validStatuses.forEach(status => {
    it(`should accept status: ${status}`, () => {
      const result = PaymentStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    });
  });

  it('should reject invalid status', () => {
    const result = PaymentStatusSchema.safeParse('invalid_status');
    expect(result.success).toBe(false);
  });
});

describe('GetPaymentInputSchema', () => {
  it('should accept string payment ID', () => {
    const result = GetPaymentInputSchema.safeParse({
      paymentId: '12345678901',
    });

    expect(result.success).toBe(true);
  });

  it('should accept numeric payment ID', () => {
    const result = GetPaymentInputSchema.safeParse({
      paymentId: 12345678901,
    });

    expect(result.success).toBe(true);
  });

  it('should reject missing payment ID', () => {
    const result = GetPaymentInputSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});

describe('SearchPaymentsInputSchema', () => {
  it('should validate complete search params', () => {
    const result = SearchPaymentsInputSchema.safeParse({
      externalReference: 'ORDER-123',
      status: 'approved',
      dateFrom: '2024-01-01',
      dateTo: '2024-01-31',
      limit: 50,
      offset: 0,
    });

    expect(result.success).toBe(true);
  });

  it('should apply defaults', () => {
    const result = SearchPaymentsInputSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(30);
      expect(result.data.offset).toBe(0);
    }
  });

  it('should reject limit over 100', () => {
    const result = SearchPaymentsInputSchema.safeParse({
      limit: 150,
    });

    expect(result.success).toBe(false);
  });

  it('should reject negative offset', () => {
    const result = SearchPaymentsInputSchema.safeParse({
      offset: -10,
    });

    expect(result.success).toBe(false);
  });
});

describe('RefundPaymentInputSchema', () => {
  it('should validate full refund', () => {
    const result = RefundPaymentInputSchema.safeParse({
      paymentId: '12345678901',
    });

    expect(result.success).toBe(true);
  });

  it('should validate partial refund', () => {
    const result = RefundPaymentInputSchema.safeParse({
      paymentId: '12345678901',
      amount: 500.50,
      reason: 'Customer request',
    });

    expect(result.success).toBe(true);
  });

  it('should reject negative refund amount', () => {
    const result = RefundPaymentInputSchema.safeParse({
      paymentId: '12345678901',
      amount: -100,
    });

    expect(result.success).toBe(false);
  });

  it('should reject zero refund amount', () => {
    const result = RefundPaymentInputSchema.safeParse({
      paymentId: '12345678901',
      amount: 0,
    });

    expect(result.success).toBe(false);
  });
});

describe('WebhookEventSchema', () => {
  it('should validate payment webhook event', () => {
    const result = WebhookEventSchema.safeParse({
      id: 12345678901,
      live_mode: true,
      type: 'payment',
      date_created: '2024-01-15T10:30:00.000-03:00',
      user_id: 12345678,
      api_version: 'v1',
      action: 'payment.created',
      data: {
        id: '98765432109',
      },
    });

    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = WebhookEventSchema.safeParse({
      type: 'payment',
      data: { id: '123' },
    });

    expect(result.success).toBe(false);
  });
});
