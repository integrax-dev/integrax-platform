import { describe, it, expect } from 'vitest';
import { matchInvoice } from './identity.js';
import { diffInvoices } from './diff.js';
import { evaluateInvoiceConflicts, invoiceRecommendation } from './policy.js';
import type { CanonicalInvoice } from './canonical.js';
import type { ManualLink } from '../../shared/entity-helpers.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function invoice(overrides: Partial<CanonicalInvoice> = {}): CanonicalInvoice {
  return {
    externalIds: [{ system: 'contabilium', id: 'CONT-INV-1' }],
    invoiceNumber: '0001-00000042',
    invoiceType: 1, // FacturaA
    customerTaxId: '20-12345678-9',
    customerName: 'Empresa Ejemplo S.A.',
    amountNet: 8264.46,
    amountTax: 1735.54,
    amountTotal: 10000,
    currency: 'ARS',
    cae: '73012345678901',
    status: 'authorized',
    issuedAt: new Date('2025-03-15'),
    updatedAt: new Date('2025-03-15'),
    sourceSystem: 'contabilium',
    ...overrides,
  };
}

// ─── matchInvoice ──────────────────────────────────────────────────────────────

describe('matchInvoice', () => {
  it('manual link always wins', () => {
    const a = invoice({ externalIds: [{ system: 'cont', id: 'A' }], cae: '111' });
    const b = invoice({ externalIds: [{ system: 'afip', id: 'B' }], cae: '222' });
    const links: ManualLink[] = [{ systemA: 'cont', externalIdA: 'A', systemB: 'afip', externalIdB: 'B' }];
    expect(matchInvoice(a, b, links).reason).toBe('manual_link');
  });

  it('external ID overlap → match', () => {
    const a = invoice({ externalIds: [{ system: 'shared', id: 'X' }] });
    const b = invoice({ externalIds: [{ system: 'shared', id: 'X' }] });
    expect(matchInvoice(a, b).reason).toBe('external_id_exact');
  });

  it('CAE match → match 0.99', () => {
    const a = invoice({ externalIds: [{ system: 'cont', id: '1' }], cae: '73012345678901' });
    const b = invoice({ externalIds: [{ system: 'afip', id: '2' }], cae: '73012345678901' });
    const r = matchInvoice(a, b);
    expect(r.reason).toBe('cae_exact');
    expect(r.confidence).toBe(0.99);
  });

  it('invoiceNumber + type + customer → match 0.97', () => {
    const a = invoice({ cae: undefined, externalIds: [{ system: 'a', id: '1' }] });
    const b = invoice({ cae: undefined, externalIds: [{ system: 'b', id: '2' }], sourceSystem: 'afip' });
    const r = matchInvoice(a, b);
    expect(r.reason).toBe('invoice_number_type_customer');
    expect(r.confidence).toBe(0.97);
  });

  it('normalized taxId in composite key: dashes stripped', () => {
    const a = invoice({ cae: undefined, externalIds: [{ system: 'a', id: '1' }], customerTaxId: '20-12345678-9' });
    const b = invoice({ cae: undefined, externalIds: [{ system: 'b', id: '2' }], customerTaxId: '20123456789', sourceSystem: 'afip' });
    const r = matchInvoice(a, b);
    expect(r.reason).toBe('invoice_number_type_customer');
  });

  it('different invoiceType → falls to invoice_number_customer (review)', () => {
    const a = invoice({ cae: undefined, externalIds: [{ system: 'a', id: '1' }], invoiceType: 1 });
    const b = invoice({ cae: undefined, externalIds: [{ system: 'b', id: '2' }], invoiceType: 6, sourceSystem: 'afip' });
    const r = matchInvoice(a, b);
    expect(r.decision).toBe('review');
    expect(r.reason).toBe('invoice_number_customer');
  });

  it('amount + customer + same day fingerprint → review 0.65', () => {
    const a = invoice({ cae: undefined, invoiceNumber: '', externalIds: [{ system: 'a', id: '1' }] });
    const b = invoice({ cae: undefined, invoiceNumber: '', externalIds: [{ system: 'b', id: '2' }], sourceSystem: 'afip' });
    const r = matchInvoice(a, b);
    expect(r.decision).toBe('review');
    expect(r.reason).toBe('amount_customer_date_fingerprint');
    expect(r.confidence).toBe(0.65);
  });

  it('completely different invoices → no_match', () => {
    const a = invoice({ cae: '111', invoiceNumber: '0001-00001', customerTaxId: '20-11111111-1', amountTotal: 1000, externalIds: [{ system: 'a', id: '1' }] });
    const b = invoice({ cae: '999', invoiceNumber: '0001-00999', customerTaxId: '20-99999999-9', amountTotal: 99999, externalIds: [{ system: 'b', id: '2' }] });
    expect(matchInvoice(a, b).decision).toBe('no_match');
  });
});

// ─── diffInvoices ──────────────────────────────────────────────────────────────

describe('diffInvoices', () => {
  it('identical invoices → no conflicts', () => {
    const a = invoice();
    const b = invoice({ sourceSystem: 'afip' });
    expect(diffInvoices(a, b)).toHaveLength(0);
  });

  it('currency mismatch → CURRENCY_MISMATCH only (early return)', () => {
    const a = invoice({ currency: 'ARS' });
    const b = invoice({ currency: 'USD', sourceSystem: 'afip' });
    const conflicts = diffInvoices(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('CURRENCY_MISMATCH');
  });

  it('customer taxId mismatch (after normalization) → CUSTOMER_TAX_ID_MISMATCH + early return', () => {
    const a = invoice({ customerTaxId: '20-11111111-1' });
    const b = invoice({ customerTaxId: '20-99999999-9', sourceSystem: 'afip' });
    const conflicts = diffInvoices(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('CUSTOMER_TAX_ID_MISMATCH');
    expect(conflicts[0].severity).toBe('CRITICAL');
  });

  it('taxId format difference only (20-12345678-9 vs 20123456789) → NO false BLOCK', () => {
    const a = invoice({ customerTaxId: '20-12345678-9' });
    const b = invoice({ customerTaxId: '20123456789', sourceSystem: 'afip' });
    expect(diffInvoices(a, b).find(c => c.type === 'CUSTOMER_TAX_ID_MISMATCH')).toBeUndefined();
  });

  it('CAE mismatch → CAE_MISMATCH CRITICAL', () => {
    const a = invoice({ cae: '111111' });
    const b = invoice({ cae: '999999', sourceSystem: 'afip' });
    const c = diffInvoices(a, b).find(x => x.type === 'CAE_MISMATCH');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('CRITICAL');
  });

  it('CAE missing on one side → CAE_MISSING HIGH', () => {
    const a = invoice({ cae: '73012345678901' });
    const b = invoice({ cae: undefined, sourceSystem: 'afip' });
    const c = diffInvoices(a, b).find(x => x.type === 'CAE_MISSING');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('HIGH');
  });

  it('amount within 0.1% tolerance → no AMOUNT_MISMATCH', () => {
    const a = invoice({ amountTotal: 10000 });
    const b = invoice({ amountTotal: 10009, sourceSystem: 'afip' }); // 0.09% drift
    expect(diffInvoices(a, b).find(c => c.type === 'AMOUNT_MISMATCH')).toBeUndefined();
  });

  it('amount above 0.1% tolerance → AMOUNT_MISMATCH CRITICAL', () => {
    const a = invoice({ amountTotal: 10000 });
    const b = invoice({ amountTotal: 10020, sourceSystem: 'afip' }); // 0.2% drift
    const c = diffInvoices(a, b).find(x => x.type === 'AMOUNT_MISMATCH');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('CRITICAL');
  });

  it('status mismatch → STATUS_MISMATCH HIGH', () => {
    const a = invoice({ status: 'authorized' });
    const b = invoice({ status: 'draft', sourceSystem: 'afip' });
    const c = diffInvoices(a, b).find(x => x.type === 'STATUS_MISMATCH');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('HIGH');
  });

  it('CUSTOMER_TAX_ID_MISMATCH stops further diff (no amount/status noise)', () => {
    const a = invoice({ customerTaxId: '20-11111111-1', amountTotal: 1000, status: 'authorized' });
    const b = invoice({ customerTaxId: '20-99999999-9', amountTotal: 99999, status: 'voided', sourceSystem: 'afip' });
    const conflicts = diffInvoices(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('CUSTOMER_TAX_ID_MISMATCH');
  });
});

// ─── policy ────────────────────────────────────────────────────────────────────

describe('evaluateInvoiceConflicts + invoiceRecommendation', () => {
  it('no conflicts → PROCEED', () => {
    expect(invoiceRecommendation(evaluateInvoiceConflicts([]))).toBe('PROCEED');
  });

  it('AMOUNT_MISMATCH → BLOCK', () => {
    const conflicts = diffInvoices(
      invoice({ amountTotal: 10000 }),
      invoice({ amountTotal: 11000, sourceSystem: 'afip' }),
    );
    expect(invoiceRecommendation(evaluateInvoiceConflicts(conflicts))).toBe('BLOCK');
  });

  it('CAE_MISSING → ALERT', () => {
    const conflicts = diffInvoices(
      invoice({ cae: '73012345678901' }),
      invoice({ cae: undefined, sourceSystem: 'afip' }),
    );
    expect(invoiceRecommendation(evaluateInvoiceConflicts(conflicts))).toBe('ALERT');
  });

  it('CAE_MISMATCH → BLOCK', () => {
    const conflicts = diffInvoices(
      invoice({ cae: '111111' }),
      invoice({ cae: '999999', sourceSystem: 'afip' }),
    );
    expect(invoiceRecommendation(evaluateInvoiceConflicts(conflicts))).toBe('BLOCK');
  });

  it('STATUS_MISMATCH → ALERT', () => {
    const conflicts = diffInvoices(
      invoice({ status: 'authorized' }),
      invoice({ status: 'draft', sourceSystem: 'afip' }),
    );
    expect(invoiceRecommendation(evaluateInvoiceConflicts(conflicts))).toBe('ALERT');
  });

  it('default policy for unknown conflict type → BLOCK (safe fallback)', () => {
    // Simulate an unknown type that has no rule
    const fakeConflict = {
      type: 'UNKNOWN_TYPE' as any,
      severity: 'HIGH' as const,
      systems: ['a', 'b'] as [string, string],
      entityType: 'invoice',
      diffs: [],
      summary: 'Unknown',
      detectedAt: new Date(),
    };
    const evaluated = evaluateInvoiceConflicts([fakeConflict]);
    expect(evaluated[0].action).toBe('BLOCK');
  });

  it('tenant override: STATUS_MISMATCH → BLOCK', () => {
    const conflicts = diffInvoices(
      invoice({ status: 'authorized' }),
      invoice({ status: 'draft', sourceSystem: 'afip' }),
    );
    expect(invoiceRecommendation(evaluateInvoiceConflicts(conflicts, { STATUS_MISMATCH: 'BLOCK' }))).toBe('BLOCK');
  });
});
