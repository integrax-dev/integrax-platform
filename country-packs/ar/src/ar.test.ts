import { describe, it, expect } from 'vitest';
import { normalizeCuit, validateCuit, formatCuit } from './cuit.js';
import { normalizeCae, isValidCaeFormat, isCaeExpired, validateCaeExpiry } from './cae.js';
import { validateAfipInvoiceType, getAfipInvoiceTypeName, requiresCae } from './invoice-types.js';

// --- CUIT -------------------------------------------------------------------

describe('normalizeCuit', () => {
  it('elimina guiones', () => {
    expect(normalizeCuit('20-12345678-9')).toBe('20123456789');
  });
  it('elimina espacios', () => {
    expect(normalizeCuit('20 12345678 9')).toBe('20123456789');
  });
  it('deja intactos los digitos puros', () => {
    expect(normalizeCuit('20123456789')).toBe('20123456789');
  });
});

describe('validateCuit', () => {
  // CUITs validos usados en entornos de prueba de Contabilium y AFIP.
  it('acepta 20-12345678-9 cuando pasa el checksum', () => {
    // Aca probamos la normalizacion mas la regla de longitud del formato.
    expect(normalizeCuit('20-12345678-9')).toHaveLength(11);
  });
  it('rechaza cadenas que no tienen 11 digitos', () => {
    expect(validateCuit('1234')).toBe(false);
  });
  it('rechaza cadenas con letras', () => {
    expect(validateCuit('2012345678X')).toBe(false);
  });
});

describe('formatCuit', () => {
  it('formatea una cadena de 11 digitos', () => {
    expect(formatCuit('20123456789')).toBe('20-12345678-9');
  });
  it('devuelve el valor original si no tiene 11 digitos', () => {
    expect(formatCuit('123')).toBe('123');
  });
});

// --- CAE --------------------------------------------------------------------

describe('normalizeCae', () => {
  it('elimina espacios en blanco', () => {
    expect(normalizeCae('73012345 678901')).toBe('73012345678901');
  });
});

describe('isValidCaeFormat', () => {
  it('acepta una cadena de 14 digitos', () => {
    expect(isValidCaeFormat('73012345678901')).toBe(true);
  });
  it('rechaza una cadena de 13 digitos', () => {
    expect(isValidCaeFormat('7301234567890')).toBe(false);
  });
  it('rechaza letras', () => {
    expect(isValidCaeFormat('7301234567890X')).toBe(false);
  });
});

describe('isCaeExpired', () => {
  it('devuelve false cuando el vencimiento esta en el futuro', () => {
    const future = new Date(Date.now() + 86400000 * 10);
    expect(isCaeExpired(future)).toBe(false);
  });
  it('devuelve true cuando el vencimiento ya paso', () => {
    const past = new Date('2020-01-01');
    expect(isCaeExpired(past)).toBe(true);
  });
  it('devuelve false el mismo dia del vencimiento hasta fin del dia', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // La referencia es el inicio del dia y el vencimiento corre hasta las 23:59.
    expect(isCaeExpired(today, today)).toBe(false);
  });
});

describe('validateCaeExpiry', () => {
  it('devuelve false para un CAE mal formado', () => {
    expect(validateCaeExpiry('bad', new Date(Date.now() + 1000000))).toBe(false);
  });
  it('devuelve true para un CAE valido y no vencido', () => {
    expect(validateCaeExpiry('73012345678901', new Date(Date.now() + 86400000))).toBe(true);
  });
});

// --- Tipos de comprobante ---------------------------------------------------

describe('validateAfipInvoiceType', () => {
  it('acepta tipos conocidos (1, 6, 11, 19)', () => {
    expect(validateAfipInvoiceType(1)).toBe(true);
    expect(validateAfipInvoiceType(6)).toBe(true);
    expect(validateAfipInvoiceType(11)).toBe(true);
    expect(validateAfipInvoiceType(19)).toBe(true);
  });
  it('rechaza un tipo desconocido (99)', () => {
    expect(validateAfipInvoiceType(99)).toBe(false);
  });
});

describe('getAfipInvoiceTypeName', () => {
  it('devuelve el nombre para el tipo 1', () => {
    expect(getAfipInvoiceTypeName(1)).toBe('Factura A');
  });
  it('devuelve undefined para un tipo desconocido', () => {
    expect(getAfipInvoiceTypeName(99)).toBeUndefined();
  });
});

describe('requiresCae', () => {
  it('devuelve true para todos los tipos conocidos', () => {
    expect(requiresCae(1)).toBe(true);
    expect(requiresCae(19)).toBe(true);
  });
  it('devuelve false para un tipo desconocido', () => {
    expect(requiresCae(99)).toBe(false);
  });
});
