import { describe, it, expect } from 'vitest';
import {
  MoneySchema,
  IdentificationSchema,
  AddressSchema,
  CustomerSchema,
  LineItemSchema,
} from '../types/index.js';

describe('MoneySchema', () => {
  it('should validate correct money object', () => {
    const result = MoneySchema.safeParse({
      amount: 1500.50,
      currency: 'ARS',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(1500.5);
      expect(result.data.currency).toBe('ARS');
    }
  });

  it('should reject negative amounts', () => {
    const result = MoneySchema.safeParse({
      amount: -100,
      currency: 'ARS',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid currency code', () => {
    const result = MoneySchema.safeParse({
      amount: 100,
      currency: 'INVALID',
    });

    expect(result.success).toBe(false);
  });

  it('should uppercase currency code', () => {
    const result = MoneySchema.safeParse({
      amount: 100,
      currency: 'usd',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('USD');
    }
  });
});

describe('IdentificationSchema', () => {
  it('should validate DNI', () => {
    const result = IdentificationSchema.safeParse({
      type: 'DNI',
      number: '30123456',
    });

    expect(result.success).toBe(true);
  });

  it('should validate CUIT', () => {
    const result = IdentificationSchema.safeParse({
      type: 'CUIT',
      number: '30-12345678-9',
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid type', () => {
    const result = IdentificationSchema.safeParse({
      type: 'INVALID',
      number: '123456',
    });

    expect(result.success).toBe(false);
  });

  it('should reject empty number', () => {
    const result = IdentificationSchema.safeParse({
      type: 'DNI',
      number: '',
    });

    expect(result.success).toBe(false);
  });
});

describe('AddressSchema', () => {
  it('should validate complete address', () => {
    const result = AddressSchema.safeParse({
      street: 'Av. Corrientes',
      streetNumber: '1234',
      city: 'Buenos Aires',
      state: 'CABA',
      zipCode: 'C1043AAZ',
      country: 'AR',
    });

    expect(result.success).toBe(true);
  });

  it('should validate partial address (all fields optional)', () => {
    const result = AddressSchema.safeParse({
      city: 'Buenos Aires',
    });

    expect(result.success).toBe(true);
  });

  it('should validate empty address', () => {
    const result = AddressSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it('should uppercase country code', () => {
    const result = AddressSchema.safeParse({
      country: 'ar',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('AR');
    }
  });

  it('should reject invalid country code length', () => {
    const result = AddressSchema.safeParse({
      country: 'ARG',
    });

    expect(result.success).toBe(false);
  });
});

describe('CustomerSchema', () => {
  it('should validate complete customer', () => {
    const result = CustomerSchema.safeParse({
      id: 'CUST-123',
      email: 'juan@example.com',
      firstName: 'Juan',
      lastName: 'Pérez',
      phone: '+5491112345678',
      identification: {
        type: 'DNI',
        number: '30123456',
      },
      address: {
        city: 'Buenos Aires',
        country: 'AR',
      },
    });

    expect(result.success).toBe(true);
  });

  it('should validate minimal customer', () => {
    const result = CustomerSchema.safeParse({
      id: 'CUST-123',
      email: 'test@example.com',
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = CustomerSchema.safeParse({
      id: 'CUST-123',
      email: 'not-an-email',
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    const result = CustomerSchema.safeParse({
      firstName: 'Juan',
    });

    expect(result.success).toBe(false);
  });
});

describe('LineItemSchema', () => {
  it('should validate complete line item', () => {
    const result = LineItemSchema.safeParse({
      id: 'LINE-001',
      sku: 'SKU-WIDGET-001',
      title: 'Widget Premium',
      description: 'A premium widget',
      quantity: 2,
      unitPrice: 4500.00,
    });

    expect(result.success).toBe(true);
  });

  it('should validate minimal line item', () => {
    const result = LineItemSchema.safeParse({
      id: 'LINE-001',
      title: 'Widget',
      quantity: 1,
      unitPrice: 100,
    });

    expect(result.success).toBe(true);
  });

  it('should reject zero quantity', () => {
    const result = LineItemSchema.safeParse({
      id: 'LINE-001',
      title: 'Widget',
      quantity: 0,
      unitPrice: 100,
    });

    expect(result.success).toBe(false);
  });

  it('should reject negative quantity', () => {
    const result = LineItemSchema.safeParse({
      id: 'LINE-001',
      title: 'Widget',
      quantity: -1,
      unitPrice: 100,
    });

    expect(result.success).toBe(false);
  });

  it('should reject negative unit price', () => {
    const result = LineItemSchema.safeParse({
      id: 'LINE-001',
      title: 'Widget',
      quantity: 1,
      unitPrice: -50,
    });

    expect(result.success).toBe(false);
  });

  it('should reject non-integer quantity', () => {
    const result = LineItemSchema.safeParse({
      id: 'LINE-001',
      title: 'Widget',
      quantity: 1.5,
      unitPrice: 100,
    });

    expect(result.success).toBe(false);
  });
});
