import { describe, it, expect } from 'vitest';
import { matchCustomer } from './identity.js';
import { diffCustomers } from './diff.js';
import { evaluateCustomerConflicts, customerRecommendation } from './policy.js';
import type { CanonicalCustomer } from './canonical.js';
import type { ManualLink } from '../../shared/entity-helpers.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function customer(overrides: Partial<CanonicalCustomer> = {}): CanonicalCustomer {
  return {
    externalIds: [{ system: 'contabilium', id: 'CONT-42' }],
    taxId: '20-12345678-9',
    name: 'Empresa Ejemplo S.A.',
    email: 'contacto@empresa.com',
    vatStatus: 'ResponsableInscripto',
    status: 'active',
    updatedAt: new Date('2025-01-01'),
    sourceSystem: 'contabilium',
    ...overrides,
  };
}

// ─── matchCustomer ─────────────────────────────────────────────────────────────

describe('matchCustomer', () => {
  it('manual link always wins', () => {
    const a = customer({ externalIds: [{ system: 'mp', id: 'A1' }], taxId: '20-11111111-1' });
    const b = customer({ externalIds: [{ system: 'cont', id: 'B1' }], taxId: '20-22222222-2' });
    const links: ManualLink[] = [{ systemA: 'mp', externalIdA: 'A1', systemB: 'cont', externalIdB: 'B1' }];
    expect(matchCustomer(a, b, links).reason).toBe('manual_link');
  });

  it('external ID overlap → match', () => {
    const a = customer({ externalIds: [{ system: 'shared', id: 'X1' }] });
    const b = customer({ externalIds: [{ system: 'shared', id: 'X1' }] });
    expect(matchCustomer(a, b).reason).toBe('external_id_exact');
  });

  it('exact taxId → match', () => {
    const a = customer({ taxId: '20123456789', externalIds: [{ system: 'a', id: '1' }] });
    const b = customer({ taxId: '20123456789', externalIds: [{ system: 'b', id: '2' }] });
    expect(matchCustomer(a, b).reason).toBe('tax_id_exact');
    expect(matchCustomer(a, b).confidence).toBe(0.98);
  });

  it('normalized taxId: dashes stripped → match', () => {
    const a = customer({ taxId: '20-12345678-9', externalIds: [{ system: 'a', id: '1' }] });
    const b = customer({ taxId: '20123456789', externalIds: [{ system: 'b', id: '2' }] });
    const r = matchCustomer(a, b);
    expect(r.reason).toBe('tax_id_normalized');
    expect(r.decision).toBe('match');
    expect(r.confidence).toBe(0.95);
  });

  it('email match → review (not a firm match)', () => {
    const a = customer({ taxId: '', externalIds: [{ system: 'a', id: '1' }], email: 'test@corp.com' });
    const b = customer({ taxId: '', externalIds: [{ system: 'b', id: '2' }], email: 'test@corp.com' });
    const r = matchCustomer(a, b);
    expect(r.decision).toBe('review');
    expect(r.reason).toBe('email_exact');
  });

  it('email case-insensitive match', () => {
    const a = customer({ taxId: '', externalIds: [{ system: 'a', id: '1' }], email: 'Test@Corp.COM' });
    const b = customer({ taxId: '', externalIds: [{ system: 'b', id: '2' }], email: 'test@corp.com' });
    expect(matchCustomer(a, b).reason).toBe('email_exact');
  });

  it('name similarity: "Empresa Ejemplo S.A." vs "Empresa Ejemplo SA" → review', () => {
    const a = customer({ taxId: '', email: 'a@corp.com', externalIds: [{ system: 'a', id: '1' }], name: 'Empresa Ejemplo S.A.' });
    const b = customer({ taxId: '', email: 'b@corp.com', externalIds: [{ system: 'b', id: '2' }], name: 'Empresa Ejemplo SA' });
    const r = matchCustomer(a, b);
    // normalizeTitle strips punctuation — these should be highly similar
    expect(r.decision).toBe('review');
    expect(r.reason).toBe('name_similarity');
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('completely different customers → no_match', () => {
    const a = customer({ taxId: '', email: 'a@corp.com', externalIds: [{ system: 'a', id: '1' }], name: 'Acme Corp' });
    const b = customer({ taxId: '', email: 'b@xyz.com', externalIds: [{ system: 'b', id: '2' }], name: 'Empresa XYZ Ltda' });
    expect(matchCustomer(a, b).decision).toBe('no_match');
  });
});

// ─── diffCustomers ─────────────────────────────────────────────────────────────

describe('diffCustomers', () => {
  it('same customer (same normalized taxId) → no conflicts', () => {
    const a = customer({ taxId: '20-12345678-9', sourceSystem: 'contabilium' });
    const b = customer({ taxId: '20123456789', sourceSystem: 'mercadopago' });
    expect(diffCustomers(a, b)).toHaveLength(0);
  });

  it('taxId format difference only → NO false BLOCK', () => {
    // "20-12345678-9" and "20123456789" are the same CUIT — critical correctness test
    const a = customer({ taxId: '20-12345678-9' });
    const b = customer({ taxId: '20123456789', sourceSystem: 'mp' });
    const conflicts = diffCustomers(a, b);
    expect(conflicts.find(c => c.type === 'TAX_ID_MISMATCH')).toBeUndefined();
  });

  it('genuinely different taxIds → TAX_ID_MISMATCH + early return', () => {
    const a = customer({ taxId: '20-11111111-1' });
    const b = customer({ taxId: '20-99999999-9', sourceSystem: 'mp' });
    const conflicts = diffCustomers(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('TAX_ID_MISMATCH');
    expect(conflicts[0].severity).toBe('CRITICAL');
  });

  it('TAX_ID_MISMATCH early return: does not emit VAT or name conflicts', () => {
    const a = customer({ taxId: '20-11111111-1', vatStatus: 'Monotributista', name: 'Corp A' });
    const b = customer({ taxId: '20-99999999-9', vatStatus: 'ResponsableInscripto', name: 'Corp B', sourceSystem: 'mp' });
    const conflicts = diffCustomers(a, b);
    // Only one conflict despite multiple differences
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('TAX_ID_MISMATCH');
  });

  it('VAT status mismatch → VAT_STATUS_MISMATCH CRITICAL', () => {
    const a = customer({ vatStatus: 'ResponsableInscripto' });
    const b = customer({ vatStatus: 'Monotributista', sourceSystem: 'mp' });
    const c = diffCustomers(a, b).find(x => x.type === 'VAT_STATUS_MISMATCH');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('CRITICAL');
  });

  it('name mismatch → NAME_MISMATCH MEDIUM', () => {
    const a = customer({ name: 'Empresa Vieja SRL' });
    const b = customer({ name: 'Empresa Nueva SRL', sourceSystem: 'mp' });
    const c = diffCustomers(a, b).find(x => x.type === 'NAME_MISMATCH');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('MEDIUM');
  });

  it('email mismatch → EMAIL_MISMATCH LOW', () => {
    const a = customer({ email: 'old@corp.com' });
    const b = customer({ email: 'new@corp.com', sourceSystem: 'mp' });
    const c = diffCustomers(a, b).find(x => x.type === 'EMAIL_MISMATCH');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('LOW');
  });

  it('status mismatch → STATUS_MISMATCH MEDIUM', () => {
    const a = customer({ status: 'active' });
    const b = customer({ status: 'inactive', sourceSystem: 'mp' });
    const c = diffCustomers(a, b).find(x => x.type === 'STATUS_MISMATCH');
    expect(c).toBeDefined();
    expect(c!.severity).toBe('MEDIUM');
  });
});

// ─── policy ────────────────────────────────────────────────────────────────────

describe('evaluateCustomerConflicts + customerRecommendation', () => {
  it('no conflicts → PROCEED', () => {
    expect(customerRecommendation(evaluateCustomerConflicts([]))).toBe('PROCEED');
  });

  it('TAX_ID_MISMATCH → BLOCK', () => {
    const conflicts = diffCustomers(
      customer({ taxId: '20-11111111-1' }),
      customer({ taxId: '20-99999999-9', sourceSystem: 'mp' }),
    );
    expect(customerRecommendation(evaluateCustomerConflicts(conflicts))).toBe('BLOCK');
  });

  it('VAT_STATUS_MISMATCH → BLOCK', () => {
    const conflicts = diffCustomers(
      customer({ vatStatus: 'ResponsableInscripto' }),
      customer({ vatStatus: 'Monotributista', sourceSystem: 'mp' }),
    );
    expect(customerRecommendation(evaluateCustomerConflicts(conflicts))).toBe('BLOCK');
  });

  it('NAME_MISMATCH → ALERT', () => {
    const conflicts = diffCustomers(
      customer({ name: 'Corp A' }),
      customer({ name: 'Corp B', sourceSystem: 'mp' }),
    );
    expect(customerRecommendation(evaluateCustomerConflicts(conflicts))).toBe('ALERT');
  });

  it('EMAIL_MISMATCH only → PROCEED (IGNORE policy)', () => {
    const conflicts = diffCustomers(
      customer({ email: 'a@corp.com' }),
      customer({ email: 'b@corp.com', sourceSystem: 'mp' }),
    );
    expect(customerRecommendation(evaluateCustomerConflicts(conflicts))).toBe('PROCEED');
  });

  it('tenant override: NAME_MISMATCH → BLOCK', () => {
    const conflicts = diffCustomers(
      customer({ name: 'Corp A' }),
      customer({ name: 'Corp B', sourceSystem: 'mp' }),
    );
    expect(customerRecommendation(evaluateCustomerConflicts(conflicts, undefined, { NAME_MISMATCH: 'BLOCK' }))).toBe('BLOCK');
  });
});
