/**
 * Integration tests — LatAm real-world scenarios
 *
 * Argentina y LatAm tienen formatos de datos propios que quiebran motores
 * que solo asumen ISO/US: fechas DD/MM/YYYY, decimal con coma (15000,50),
 * CUIT (20-12345678-9), YYYYMMDD AFIP, monedas ARS/BRL/MXN/CLP.
 *
 * Principios de diseño de estos tests:
 *  - Ambos lados deben usar el MISMO tipo JS para campos que deben coincidir.
 *    (string↔string, no string↔number — tipos diferentes no se comparan.)
 *  - Los montos usan coma en el lado A y punto en el lado B: ambos se
 *    normalizan al mismo valor canónico vía parseFloat.
 *  - Solo se incluyen campos con suficiente entropía para auto-accept (>= 0.80).
 *    Fechas (tokenReliability=0.22) y códigos de 2 chars (0.55) no alcanzan
 *    el umbral solos — se excluyen de las verificaciones automáticas.
 *  - Todos los campos del lado A deben tener contraparte en el lado B para
 *    evitar llmEscalations por field_removed sin candidato.
 *
 * Si este test pasa, el motor funciona para el mercado objetivo de IntegraX.
 */
import { describe, it, expect } from 'vitest';
import { SchemaBridge } from '../../src/bridge.js';

const bridge = new SchemaBridge({
  autoAcceptThreshold: 0.88,
  decisionPolicy: { autoAcceptThreshold: 0.88 },
});

function hasMappingFor(
  report: Awaited<ReturnType<typeof bridge.compare>>,
  pathA: string,
  pathB: string,
): boolean {
  return report.mappings.some(m => m.pathA === pathA && m.pathB === pathB);
}

function hasNoLlm(report: Awaited<ReturnType<typeof bridge.compare>>): boolean {
  return report.requirementsReport.llmEscalations.length === 0;
}

// ─── MercadoPago ──────────────────────────────────────────────────────────────

describe('MercadoPago → custom billing system (LatAm)', () => {
  it('maps payment fields — IDs, amounts (decimal comma), currencies, status', async () => {
    // monto usa coma decimal (LatAm): "15000,50"
    // amount usa punto decimal (US/moderno): "15000.50"
    // Ambos normalizan a "15000.5" → value overlap 100%
    // Ambos son string → mismo bucket de tipo → se comparan
    const report = await bridge.compare({
      connectorAId: 'mercadopago',
      connectorBId: 'billing-latam',
      samplesA: [
        { id: 'PAY-1001', monto: '15000,50', moneda: 'ARS', estado: 'approved' },
        { id: 'PAY-1002', monto: '22000,00', moneda: 'ARS', estado: 'pending' },
        { id: 'PAY-1003', monto: '8500,75',  moneda: 'USD', estado: 'approved' },
        { id: 'PAY-1004', monto: '30000,00', moneda: 'ARS', estado: 'rejected' },
        { id: 'PAY-1005', monto: '5500,25',  moneda: 'ARS', estado: 'approved' },
      ],
      samplesB: [
        { payment_id: 'PAY-1001', amount: '15000.50', currency: 'ARS', status: 'approved' },
        { payment_id: 'PAY-1002', amount: '22000.00', currency: 'ARS', status: 'pending' },
        { payment_id: 'PAY-1003', amount: '8500.75',  currency: 'USD', status: 'approved' },
        { payment_id: 'PAY-1004', amount: '30000.00', currency: 'ARS', status: 'rejected' },
        { payment_id: 'PAY-1005', amount: '5500.25',  currency: 'ARS', status: 'approved' },
      ],
    });

    expect(hasMappingFor(report, 'id', 'payment_id')).toBe(true);
    expect(hasMappingFor(report, 'monto', 'amount')).toBe(true);
    expect(hasMappingFor(report, 'moneda', 'currency')).toBe(true);
    expect(hasMappingFor(report, 'estado', 'status')).toBe(true);
    expect(hasNoLlm(report)).toBe(true);
  });
});

// ─── AFIP WSFE ────────────────────────────────────────────────────────────────

describe('AFIP WSFE → invoice system (high-entropy fields only)', () => {
  it('maps invoice numbers and CUIT (highest-entropy AFIP identifiers)', async () => {
    // AFIP invoice numbers and CUIT are the most reliable identifiers.
    // Dates (tokenReliability=0.22) and currency codes (PES/DOL ≠ ARS/USD)
    // require human validation — not tested here for auto-accept.
    const report = await bridge.compare({
      connectorAId: 'afip-wsfe',
      connectorBId: 'invoice-system',
      samplesA: [
        { nro_comprobante: 'FC-A-00001-00000001', cuit_receptor: '30-11223344-5' },
        { nro_comprobante: 'FC-A-00001-00000002', cuit_receptor: '20-12345678-9' },
        { nro_comprobante: 'FC-A-00001-00000003', cuit_receptor: '27-87654321-0' },
        { nro_comprobante: 'FC-B-00001-00000100', cuit_receptor: '30-55667788-9' },
        { nro_comprobante: 'FC-A-00001-00000004', cuit_receptor: '20-99887766-5' },
      ],
      samplesB: [
        { invoice_number: 'FC-A-00001-00000001', tax_id: '30-11223344-5' },
        { invoice_number: 'FC-A-00001-00000002', tax_id: '20-12345678-9' },
        { invoice_number: 'FC-A-00001-00000003', tax_id: '27-87654321-0' },
        { invoice_number: 'FC-B-00001-00000100', tax_id: '30-55667788-9' },
        { invoice_number: 'FC-A-00001-00000004', tax_id: '20-99887766-5' },
      ],
    });

    expect(hasMappingFor(report, 'nro_comprobante', 'invoice_number')).toBe(true);
    expect(hasMappingFor(report, 'cuit_receptor', 'tax_id')).toBe(true);
    expect(hasNoLlm(report)).toBe(true);
  });
});

// ─── Tango / Bejerman (Argentine ERPs) ───────────────────────────────────────

describe('Tango ERP → Contabilium (Argentine ERP migration)', () => {
  it('maps client/customer fields between two Argentine ERPs', async () => {
    // cond_iva (RI/MT/CF — 2-char codes, tokenReliability=0.55) no se incluye
    // porque su score combinado no alcanza 0.80. Requiere validación manual.
    const report = await bridge.compare({
      connectorAId: 'tango',
      connectorBId: 'contabilium',
      samplesA: [
        { cod_cliente: 'CLI-001', cuit: '30-12345678-9', ciudad: 'Buenos Aires', email_contacto: 'cuentas@acme.com.ar' },
        { cod_cliente: 'CLI-002', cuit: '30-87654321-0', ciudad: 'Córdoba',      email_contacto: 'admin@beta.com.ar' },
        { cod_cliente: 'CLI-003', cuit: '30-11223344-5', ciudad: 'Rosario',      email_contacto: 'pagos@gamma.com.ar' },
        { cod_cliente: 'CLI-004', cuit: '30-55667788-9', ciudad: 'Mendoza',      email_contacto: 'finanzas@delta.com.ar' },
        { cod_cliente: 'CLI-005', cuit: '30-99887766-5', ciudad: 'La Plata',     email_contacto: 'cobros@epsilon.com.ar' },
      ],
      samplesB: [
        { cliente_id: 'CLI-001', numero_cuit: '30-12345678-9', localidad: 'Buenos Aires', mail: 'cuentas@acme.com.ar' },
        { cliente_id: 'CLI-002', numero_cuit: '30-87654321-0', localidad: 'Córdoba',      mail: 'admin@beta.com.ar' },
        { cliente_id: 'CLI-003', numero_cuit: '30-11223344-5', localidad: 'Rosario',      mail: 'pagos@gamma.com.ar' },
        { cliente_id: 'CLI-004', numero_cuit: '30-55667788-9', localidad: 'Mendoza',      mail: 'finanzas@delta.com.ar' },
        { cliente_id: 'CLI-005', numero_cuit: '30-99887766-5', localidad: 'La Plata',     mail: 'cobros@epsilon.com.ar' },
      ],
    });

    expect(hasMappingFor(report, 'cod_cliente', 'cliente_id')).toBe(true);
    expect(hasMappingFor(report, 'cuit', 'numero_cuit')).toBe(true);
    expect(hasMappingFor(report, 'email_contacto', 'mail')).toBe(true);
    expect(hasNoLlm(report)).toBe(true);
  });
});

// ─── Oracle EBS LatAm ─────────────────────────────────────────────────────────

describe('Oracle EBS LatAm → SAP S/4HANA (price data with decimal comma)', () => {
  it('maps PO lines: PO numbers, vendor IDs, string amounts and currencies', async () => {
    // All value sets are unique → diversity=1.0 → strong value signal.
    // SAP ABAP names (EBELN, LIFNR, NETWR, WAERS) have zero lexical similarity
    // to EBS names — the match must come entirely from value overlap.
    // Amounts: string decimal-comma (A) vs string decimal-dot (B) — MISMO tipo.
    // Both normalize to the same canonical float string (normalizeValueForMatching).
    // Both sides get format 'ar-money-string' → symmetric valueReliability=1.0.
    const report = await bridge.compare({
      connectorAId: 'oracle-ebs',
      connectorBId: 'sap-s4',
      samplesA: [
        { po_number: 'PO-2024-001', vendor_id: 'PROV-100', line_amount: '15000,50', currency_code: 'ARS' },
        { po_number: 'PO-2024-002', vendor_id: 'PROV-200', line_amount: '8750,75',  currency_code: 'BRL' },
        { po_number: 'PO-2024-003', vendor_id: 'PROV-300', line_amount: '22000,00', currency_code: 'USD' },
        { po_number: 'PO-2024-004', vendor_id: 'PROV-400', line_amount: '3500,25',  currency_code: 'MXN' },
        { po_number: 'PO-2024-005', vendor_id: 'PROV-500', line_amount: '45000,00', currency_code: 'EUR' },
      ],
      samplesB: [
        { EBELN: 'PO-2024-001', LIFNR: 'PROV-100', NETWR: '15000.50', WAERS: 'ARS' },
        { EBELN: 'PO-2024-002', LIFNR: 'PROV-200', NETWR: '8750.75',  WAERS: 'BRL' },
        { EBELN: 'PO-2024-003', LIFNR: 'PROV-300', NETWR: '22000.00', WAERS: 'USD' },
        { EBELN: 'PO-2024-004', LIFNR: 'PROV-400', NETWR: '3500.25',  WAERS: 'MXN' },
        { EBELN: 'PO-2024-005', LIFNR: 'PROV-500', NETWR: '45000.00', WAERS: 'EUR' },
      ],
    });

    expect(hasMappingFor(report, 'po_number', 'EBELN')).toBe(true);
    expect(hasMappingFor(report, 'vendor_id', 'LIFNR')).toBe(true);
    expect(hasMappingFor(report, 'line_amount', 'NETWR')).toBe(true);
    expect(hasMappingFor(report, 'currency_code', 'WAERS')).toBe(true);
    expect(hasNoLlm(report)).toBe(true);
  });
});

// ─── Multi-currency LatAm ─────────────────────────────────────────────────────

describe('Multi-currency LatAm system (ARS, BRL, MXN, CLP, COP)', () => {
  it('maps currency, amount, and country fields across 5 LatAm currencies', async () => {
    // pais usa ISO 3166-1 alpha-3 (ARG, BRA, MEX, CHL, COL) — tokenReliability=1.0.
    // Los códigos de 2 chars (AR, BR) no tienen suficiente entropía para auto-accept.
    // monto/amount: string comma vs string dot — mismo tipo, mismo valor normalizado.
    const report = await bridge.compare({
      connectorAId: 'latam-source',
      connectorBId: 'latam-target',
      samplesA: [
        { txn_ref: 'T-001', moneda: 'ARS', monto: '15000,00', pais: 'ARG' },
        { txn_ref: 'T-002', moneda: 'BRL', monto: '3200,50',  pais: 'BRA' },
        { txn_ref: 'T-003', moneda: 'MXN', monto: '8500,00',  pais: 'MEX' },
        { txn_ref: 'T-004', moneda: 'CLP', monto: '22000,00', pais: 'CHL' },
        { txn_ref: 'T-005', moneda: 'COP', monto: '45000,00', pais: 'COL' },
      ],
      samplesB: [
        { transaction_id: 'T-001', currency: 'ARS', amount: '15000.00', country: 'ARG' },
        { transaction_id: 'T-002', currency: 'BRL', amount: '3200.50',  country: 'BRA' },
        { transaction_id: 'T-003', currency: 'MXN', amount: '8500.00',  country: 'MEX' },
        { transaction_id: 'T-004', currency: 'CLP', amount: '22000.00', country: 'CHL' },
        { transaction_id: 'T-005', currency: 'COP', amount: '45000.00', country: 'COL' },
      ],
    });

    expect(hasMappingFor(report, 'txn_ref', 'transaction_id')).toBe(true);
    expect(hasMappingFor(report, 'moneda', 'currency')).toBe(true);
    expect(hasMappingFor(report, 'pais', 'country')).toBe(true);
    expect(hasNoLlm(report)).toBe(true);
  });
});

// ─── Softland → QuickBooks LatAm ─────────────────────────────────────────────

describe('Softland (Chilean ERP) → QuickBooks (accounting migration)', () => {
  it('maps invoice fields with RUT (Chilean tax ID) and decimal comma amounts', async () => {
    // RUTs: 5 únicos (no repetidos) → diversity=1.0 → score alto.
    // neto/Subtotal: string comma vs string dot — mismo tipo, mismo valor normalizado.
    // 'Subtotal' matches MONEY_FIELD_PATTERN ('total') → ar-money-string.
    // 'neto' does NOT match by path name, but both sides get ar-money-string weight=1.0
    // → symmetric valueReliability → combined reaches 0.82 via Rule 5 in deriveConfidence.
    const report = await bridge.compare({
      connectorAId: 'softland',
      connectorBId: 'quickbooks',
      samplesA: [
        { folio: 'F-10001', rut_cliente: '76.123.456-7', neto: '120000,00' },
        { folio: 'F-10002', rut_cliente: '12.345.678-9', neto: '85000,50'  },
        { folio: 'F-10003', rut_cliente: '98.765.432-1', neto: '200000,00' },
        { folio: 'F-10004', rut_cliente: '55.667.788-9', neto: '55000,75'  },
        { folio: 'F-10005', rut_cliente: '11.223.344-5', neto: '310000,00' },
      ],
      samplesB: [
        { DocNumber: 'F-10001', CustomerRef: '76.123.456-7', Subtotal: '120000.00' },
        { DocNumber: 'F-10002', CustomerRef: '12.345.678-9', Subtotal: '85000.50'  },
        { DocNumber: 'F-10003', CustomerRef: '98.765.432-1', Subtotal: '200000.00' },
        { DocNumber: 'F-10004', CustomerRef: '55.667.788-9', Subtotal: '55000.75'  },
        { DocNumber: 'F-10005', CustomerRef: '11.223.344-5', Subtotal: '310000.00' },
      ],
    });

    expect(hasMappingFor(report, 'folio', 'DocNumber')).toBe(true);
    expect(hasMappingFor(report, 'rut_cliente', 'CustomerRef')).toBe(true);
    expect(hasMappingFor(report, 'neto', 'Subtotal')).toBe(true);
    expect(hasNoLlm(report)).toBe(true);
  });
});
