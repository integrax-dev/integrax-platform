import { describe, it, expect } from 'vitest';
import { normalizeCnpj, isValidCnpjFormat, validateCnpj, formatCnpj } from './cnpj.js';
import { BR_NFE_TYPES, isValidNfeType } from './nfe.js';
import { BR_RECONCILIATION_PROFILE } from './reconciliation-profile.js';

describe('normalizeCnpj', () => {
  it('strips dots, slash, dash', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });
  it('leaves plain digits unchanged', () => {
    expect(normalizeCnpj('11222333000181')).toBe('11222333000181');
  });
});

describe('isValidCnpjFormat', () => {
  it('accepts 14-digit string', () => expect(isValidCnpjFormat('11222333000181')).toBe(true));
  it('rejects 13 digits', () => expect(isValidCnpjFormat('1122233300018')).toBe(false));
});

describe('validateCnpj', () => {
  it('rejects all-same-digit sequences', () => {
    expect(validateCnpj('11111111111111')).toBe(false);
  });
  it('rejects wrong check digits', () => {
    expect(validateCnpj('11222333000100')).toBe(false);
  });
});

describe('formatCnpj', () => {
  it('formats 14-digit CNPJ', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('returns raw if length wrong', () => {
    expect(formatCnpj('123')).toBe('123');
  });
});

describe('BR_NFE_TYPES', () => {
  it('includes code 55 (NF-e)', () => expect('55' in BR_NFE_TYPES).toBe(true));
  it('isValidNfeType rejects unknown', () => expect(isValidNfeType('99')).toBe(false));
});

describe('BR_RECONCILIATION_PROFILE', () => {
  it('countryCode is BR', () => expect(BR_RECONCILIATION_PROFILE.countryCode).toBe('BR'));
  it('fiscalAuthCodeField is chaveAcesso', () => {
    expect(BR_RECONCILIATION_PROFILE.fiscalAuthCodeField).toBe('chaveAcesso');
  });
  it('normalizeTaxId strips non-digits', () => {
    expect(BR_RECONCILIATION_PROFILE.normalizeTaxId('11.222.333/0001-81')).toBe('11222333000181');
  });
});
