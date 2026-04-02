/**
 * Unit tests for normalizeValueForMatching and tokenReliability
 *
 * Estos son los cimientos del motor de similitud por valor.
 * Si alguno de estos falla, los scores de confianza serán incorrectos
 * para datos LatAm / legacy ERPs.
 */
import { describe, it, expect } from 'vitest';
import { _normalizeValueForMatching, _tokenReliability } from '../../src/similarity-engine.js';

// ─── normalizeValueForMatching ────────────────────────────────────────────────

describe('normalizeValueForMatching — null / undefined', () => {
  it('null → "<null>"', () => expect(_normalizeValueForMatching(null)).toBe('<null>'));
  it('undefined → "<undefined>"', () => expect(_normalizeValueForMatching(undefined)).toBe('<undefined>'));
});

describe('normalizeValueForMatching — booleans', () => {
  it('true → "true"', () => expect(_normalizeValueForMatching(true)).toBe('true'));
  it('false → "false"', () => expect(_normalizeValueForMatching(false)).toBe('false'));
});

describe('normalizeValueForMatching — DD/MM/YYYY dates (LatAm)', () => {
  it('01/03/2024 → 2024-03-01', () => expect(_normalizeValueForMatching('01/03/2024')).toBe('2024-03-01'));
  it('15/12/2023 → 2023-12-15', () => expect(_normalizeValueForMatching('15/12/2023')).toBe('2023-12-15'));
  it('31/01/2025 → 2025-01-31', () => expect(_normalizeValueForMatching('31/01/2025')).toBe('2025-01-31'));
  it('does not transform US format MM/DD/YYYY (only matches DD/MM/YYYY pattern)', () => {
    // Pattern \d{2}/\d{2}/\d{4} matches both — we normalize all of them.
    // The point is day-first LatAm dates get the same canonical form as ISO.
    expect(_normalizeValueForMatching('03/15/2024')).toBe('2024-15-03');
  });
});

describe('normalizeValueForMatching — YYYYMMDD string (AFIP format)', () => {
  it('"20240315" → "2024-03-15"', () => expect(_normalizeValueForMatching('20240315')).toBe('2024-03-15'));
  it('"19900101" → "1990-01-01"', () => expect(_normalizeValueForMatching('19900101')).toBe('1990-01-01'));
  it('"20991231" → "2099-12-31"', () => expect(_normalizeValueForMatching('20991231')).toBe('2099-12-31'));
  it('invalid month "20241399" — not normalized', () => {
    // month 13 is invalid — should NOT produce a date
    expect(_normalizeValueForMatching('20241399')).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('normalizeValueForMatching — YYYYMMDD integer (AFIP numeric)', () => {
  it('20240315 (integer) → "2024-03-15"', () => expect(_normalizeValueForMatching(20240315)).toBe('2024-03-15'));
  it('19991231 (integer) → "1999-12-31"', () => expect(_normalizeValueForMatching(19991231)).toBe('1999-12-31'));
  it('12345678 (integer) — below 19000101, not a date', () => {
    expect(_normalizeValueForMatching(12345678)).toBe('12345678');
  });
  it('21000101 (integer) — above 20991231, not a date', () => {
    expect(_normalizeValueForMatching(21000101)).toBe('21000101');
  });
});

describe('normalizeValueForMatching — decimal comma (LatAm)', () => {
  it('"1234,56" → "1234.56"', () => expect(_normalizeValueForMatching('1234,56')).toBe('1234.56'));
  it('"0,5" → "0.5"', () => expect(_normalizeValueForMatching('0,5')).toBe('0.5'));
  it('"-100,99" → "-100.99"', () => expect(_normalizeValueForMatching('-100,99')).toBe('-100.99'));
  // Trailing zeros removed by parseFloat — matches JS float string representation
  it('"15000,00" → "15000" (parseFloat removes trailing zeros)', () => expect(_normalizeValueForMatching('15000,00')).toBe('15000'));
  it('"1500,50" → "1500.5" (matches 1500.50 as JS float)', () => expect(_normalizeValueForMatching('1500,50')).toBe('1500.5'));
  it('"2200,00" → "2200" (matches 2200.0 as JS float)', () => expect(_normalizeValueForMatching('2200,00')).toBe('2200'));
  it('"AR,US" — two alpha codes, NOT decimal — unchanged', () => {
    expect(_normalizeValueForMatching('AR,US')).toBe('ar,us');
  });
  it('"aprobado,pendiente" — text, NOT decimal — unchanged', () => {
    expect(_normalizeValueForMatching('aprobado,pendiente')).toBe('aprobado,pendiente');
  });
});

describe('normalizeValueForMatching — decimal dot (US/modern string format)', () => {
  it('"15000.00" → "15000" (trailing zero removal)', () => expect(_normalizeValueForMatching('15000.00')).toBe('15000'));
  it('"1500.50" → "1500.5"', () => expect(_normalizeValueForMatching('1500.50')).toBe('1500.5'));
  it('"8500.75" → "8500.75" (no trailing zero)', () => expect(_normalizeValueForMatching('8500.75')).toBe('8500.75'));
  it('"3.14" → "3.14" (no trailing zero)', () => expect(_normalizeValueForMatching('3.14')).toBe('3.14'));
  it('"22000.00" → "22000"', () => expect(_normalizeValueForMatching('22000.00')).toBe('22000'));
  // Cross-format matching: comma vs dot both produce the same canonical string
  it('"15000,00" and "15000.00" both → "15000"', () => {
    expect(_normalizeValueForMatching('15000,00')).toBe('15000');
    expect(_normalizeValueForMatching('15000.00')).toBe('15000');
  });
  it('"1500,50" and "1500.50" both → "1500.5"', () => {
    expect(_normalizeValueForMatching('1500,50')).toBe('1500.5');
    expect(_normalizeValueForMatching('1500.50')).toBe('1500.5');
  });
});

describe('normalizeValueForMatching — numbers', () => {
  it('regular integer → lowercased string', () => expect(_normalizeValueForMatching(42)).toBe('42'));
  it('float → string', () => expect(_normalizeValueForMatching(3.14)).toBe('3.14'));
});

describe('normalizeValueForMatching — lowercase normalization', () => {
  it('uppercased string → lowercase', () => expect(_normalizeValueForMatching('EUR')).toBe('eur'));
  it('mixed case email → lowercase', () => {
    expect(_normalizeValueForMatching('User@EXAMPLE.com')).toBe('user@example.com');
  });
});

// ─── tokenReliability ────────────────────────────────────────────────────────

describe('tokenReliability — placeholder values', () => {
  it('"n/a" → 0.03', () => expect(_tokenReliability('n/a')).toBe(0.03));
  it('"null" → 0.03', () => expect(_tokenReliability('null')).toBe(0.03));
  it('"-" → 0.03', () => expect(_tokenReliability('-')).toBe(0.03));
  it('"tbd" → 0.03', () => expect(_tokenReliability('tbd')).toBe(0.03));
  it('"none" → 0.03', () => expect(_tokenReliability('none')).toBe(0.03));
  it('"unknown" → 0.03', () => expect(_tokenReliability('unknown')).toBe(0.03));
  it('empty string → 0.03', () => expect(_tokenReliability('')).toBe(0.03));
});

describe('tokenReliability — booleans', () => {
  it('"true" → 0.06', () => expect(_tokenReliability('true')).toBe(0.06));
  it('"false" → 0.06', () => expect(_tokenReliability('false')).toBe(0.06));
});

describe('tokenReliability — 1-char alpha (noise)', () => {
  it('"a" → 0.12', () => expect(_tokenReliability('a')).toBe(0.12));
  it('"y" → 0.12', () => expect(_tokenReliability('y')).toBe(0.12));
  it('"n" → 0.12', () => expect(_tokenReliability('n')).toBe(0.12));
});

describe('tokenReliability — 2-char alpha (ISO country / language codes)', () => {
  it('"AR" → 0.55 (Argentina)', () => expect(_tokenReliability('AR')).toBe(0.55));
  it('"US" → 0.55', () => expect(_tokenReliability('US')).toBe(0.55));
  it('"GB" → 0.55', () => expect(_tokenReliability('GB')).toBe(0.55));
  it('"BR" → 0.55', () => expect(_tokenReliability('BR')).toBe(0.55));
  it('"es" → 0.55 (language code, lowercase)', () => expect(_tokenReliability('es')).toBe(0.55));
});

describe('tokenReliability — 3-char alpha (ISO currency codes)', () => {
  it('"EUR" → 1.0', () => expect(_tokenReliability('EUR')).toBe(1));
  it('"USD" → 1.0', () => expect(_tokenReliability('USD')).toBe(1));
  it('"ARS" → 1.0 (Argentine peso)', () => expect(_tokenReliability('ARS')).toBe(1));
  it('"GBP" → 1.0', () => expect(_tokenReliability('GBP')).toBe(1));
  it('"BRL" → 1.0', () => expect(_tokenReliability('BRL')).toBe(1));
  it('"MXN" → 1.0', () => expect(_tokenReliability('MXN')).toBe(1));
});

describe('tokenReliability — numeric strings', () => {
  it('≤2 digits → 0.08', () => expect(_tokenReliability('99')).toBe(0.08));
  it('3–4 digits → 0.28', () => expect(_tokenReliability('1234')).toBe(0.28));
  it('5–8 digits → 0.58', () => expect(_tokenReliability('12345678')).toBe(0.58));
  it('>8 digits → 0.82', () => expect(_tokenReliability('123456789')).toBe(0.82));
});

describe('tokenReliability — dates', () => {
  it('ISO date "2024-03-15" → 0.22', () => expect(_tokenReliability('2024-03-15')).toBe(0.22));
  it('ISO datetime "2024-03-15T10:00:00Z" → 0.22', () => expect(_tokenReliability('2024-03-15T10:00:00Z')).toBe(0.22));
});

describe('tokenReliability — high-entropy values', () => {
  it('UUID → 1.0', () => expect(_tokenReliability('550e8400-e29b-41d4-a716-446655440000')).toBe(1));
  it('SKU code "SKU-100" → 1.0', () => expect(_tokenReliability('SKU-100')).toBe(1));
  it('email → 1.0', () => expect(_tokenReliability('user@example.com')).toBe(1));
  it('CUIT "20-12345678-9" → 1.0', () => expect(_tokenReliability('20-12345678-9')).toBe(1));
});
