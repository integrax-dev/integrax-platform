import { describe, it, expect } from 'vitest';
import { normalizeRfc, isValidRfcFormat } from './rfc.js';
import { MX_CFDI_TYPES, isValidCfdiType, getCfdiTypeName } from './cfdi.js';
import { MX_RECONCILIATION_PROFILE } from './reconciliation-profile.js';

describe('normalizeRfc', () => {
  it('uppercases and trims', () => {
    expect(normalizeRfc('  abc123456xyz  ')).toBe('ABC123456XYZ');
  });
});

describe('isValidRfcFormat', () => {
  it('accepts Persona Moral (12 chars)', () => {
    expect(isValidRfcFormat('ABC123456XYZ')).toBe(true);
  });
  it('accepts Persona Física (13 chars)', () => {
    expect(isValidRfcFormat('ABCD123456XYZ')).toBe(true);
  });
  it('rejects too-short RFC', () => {
    expect(isValidRfcFormat('AB1234')).toBe(false);
  });
});

describe('MX_CFDI_TYPES', () => {
  it('has Ingreso (I)', () => expect(MX_CFDI_TYPES['I']?.name).toBe('Ingreso'));
  it('isValidCfdiType accepts I', () => expect(isValidCfdiType('I')).toBe(true));
  it('isValidCfdiType rejects unknown', () => expect(isValidCfdiType('Z')).toBe(false));
  it('getCfdiTypeName returns name', () => expect(getCfdiTypeName('P')).toBe('Pago'));
});

describe('MX_RECONCILIATION_PROFILE', () => {
  it('countryCode is MX', () => expect(MX_RECONCILIATION_PROFILE.countryCode).toBe('MX'));
  it('fiscalAuthCodeField is folioFiscal', () => {
    expect(MX_RECONCILIATION_PROFILE.fiscalAuthCodeField).toBe('folioFiscal');
  });
  it('normalizeTaxId normalizes RFC', () => {
    expect(MX_RECONCILIATION_PROFILE.normalizeTaxId('abc123456xyz')).toBe('ABC123456XYZ');
  });
  it('isValidInvoiceType accepts I', () => {
    expect(MX_RECONCILIATION_PROFILE.isValidInvoiceType('I')).toBe(true);
  });
});
