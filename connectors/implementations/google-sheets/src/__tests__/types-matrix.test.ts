/**
 * Google Sheets — Schema validation matrix tests
 * Uses it.each() to cover many LatAm business scenarios
 */
import { describe, it, expect } from 'vitest';
import {
  GoogleSheetsAuthSchema,
  ReadRangeInputSchema,
  WriteRangeInputSchema,
  AppendRowsInputSchema,
  SheetDataSchema,
  SpreadsheetSchema,
} from '../types.js';

// ─── Auth schema matrix ───────────────────────────────────────────────────────

describe('GoogleSheetsAuthSchema matrix', () => {
  const validOAuth2Cases = [
    { type: 'oauth2', accessToken: 'ya29.a0AfH6SMBshort' },
    { type: 'oauth2', accessToken: 'ya29.a0AfH6SMBlong_token_123456789', refreshToken: '1//0gY_refresh' },
    { type: 'oauth2', accessToken: 'ya29.sometoken', refreshToken: '1//refresh' },
    { type: 'oauth2', accessToken: 'token-1' },
    { type: 'oauth2', accessToken: 'token-2', refreshToken: undefined },
  ];

  it.each(validOAuth2Cases)('accepts valid oauth2: $accessToken', (auth) => {
    expect(GoogleSheetsAuthSchema.safeParse(auth).success).toBe(true);
  });

  const validServiceAccountCases = [
    { type: 'service_account', serviceAccountKey: '{"type":"service_account"}' },
    { type: 'service_account', serviceAccountKey: '{"project_id":"my-project","private_key":"---"}' },
    { type: 'service_account', serviceAccountKey: 'minimalkey' },
  ];

  it.each(validServiceAccountCases)('accepts valid service_account: $serviceAccountKey', (auth) => {
    expect(GoogleSheetsAuthSchema.safeParse(auth).success).toBe(true);
  });

  const invalidCases = [
    { type: 'oauth2', accessToken: '' },
    { type: 'service_account', serviceAccountKey: '' },
    { type: 'invalid', accessToken: 'token' },
    { type: 'api_key', key: 'somekey' },
    {},
    { accessToken: 'token' },
    null,
    'string',
  ];

  it.each(invalidCases)('rejects invalid auth: %j', (auth) => {
    expect(GoogleSheetsAuthSchema.safeParse(auth).success).toBe(false);
  });
});

// ─── ReadRangeInput matrix ────────────────────────────────────────────────────

describe('ReadRangeInputSchema matrix', () => {
  const validRanges = [
    'Sheet1!A1:Z100',
    'Ventas 2024!A1:D1000',
    'Clientes!A:Z',
    'Datos!1:1000',
    "'Mi Hoja'!A1:B2",
    'A1:Z100',
    'Sheet1',
    'Facturas!A1:J500',
    'Pagos MercadoPago!A1:K200',
    'AFIP Comprobantes!A1:F1000',
    'Contabilium Asientos!A1:H500',
    'WhatsApp Mensajes!A1:E10000',
  ];

  it.each(validRanges)('accepts range: %s', (range) => {
    const result = ReadRangeInputSchema.safeParse({
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      range,
    });
    expect(result.success).toBe(true);
  });

  const majorDimensions = ['ROWS', 'COLUMNS'] as const;
  it.each(majorDimensions)('accepts majorDimension=%s', (majorDimension) => {
    const result = ReadRangeInputSchema.safeParse({
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      range: 'Sheet1!A1:B2',
      majorDimension,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.majorDimension).toBe(majorDimension);
  });

  it('defaults majorDimension to ROWS', () => {
    const result = ReadRangeInputSchema.safeParse({
      spreadsheetId: '1Bxi',
      range: 'Sheet1!A1',
    });
    expect(result.success && result.data.majorDimension).toBe('ROWS');
  });

  const invalidCases = [
    {},
    { spreadsheetId: '1Bxi' },
    { range: 'Sheet1!A1' },
  ];

  it.each(invalidCases)('rejects invalid: %j', (input) => {
    expect(ReadRangeInputSchema.safeParse(input).success).toBe(false);
  });
});

// ─── WriteRangeInput matrix ───────────────────────────────────────────────────

describe('WriteRangeInputSchema matrix', () => {
  const latamDataRows: Array<{ label: string; values: unknown[][] }> = [
    {
      label: 'MercadoPago payments',
      values: [
        ['PAY-001', '15000.50', 'ARS', 'approved', '2024-01-15'],
        ['PAY-002', '8500.75', 'BRL', 'pending', '2024-01-16'],
        ['PAY-003', '22000.00', 'MXN', 'rejected', '2024-01-17'],
      ],
    },
    {
      label: 'AFIP invoices',
      values: [
        ['FC-A-00001-00000001', '30-11223344-5', '15000.50', '21', 'approved'],
        ['FC-B-00001-00000002', '20-12345678-9', '8500.75', '0', 'approved'],
      ],
    },
    {
      label: 'Single header row',
      values: [['Fecha', 'Cliente', 'CUIT', 'Monto', 'Moneda', 'Estado']],
    },
    {
      label: 'Mixed types',
      values: [[true, 42, 15000.50, null, 'string', false]],
    },
    {
      label: 'Empty rows',
      values: [[], [], ['only-first']],
    },
  ];

  it.each(latamDataRows)('writes $label', ({ values }) => {
    const result = WriteRangeInputSchema.safeParse({
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      range: 'Sheet1!A1',
      values,
    });
    expect(result.success).toBe(true);
  });

  const valueInputOptions = ['RAW', 'USER_ENTERED'] as const;
  it.each(valueInputOptions)('accepts valueInputOption=%s', (opt) => {
    const result = WriteRangeInputSchema.safeParse({
      spreadsheetId: '1Bxi',
      range: 'A1',
      values: [['test']],
      valueInputOption: opt,
    });
    expect(result.success).toBe(true);
  });
});

// ─── AppendRows matrix ────────────────────────────────────────────────────────

describe('AppendRowsInputSchema matrix', () => {
  const appendCases: Array<{ label: string; values: unknown[][] }> = [
    { label: 'single row', values: [['2024-01-17', 'Empresa SRL', '30-98765432-1', 50000]] },
    { label: 'multiple rows', values: Array.from({ length: 50 }, (_, i) => [`2024-01-${i + 1}`, `Client ${i}`, i * 1000]) },
    { label: 'with nulls', values: [[null, 'value', null]] },
    { label: 'formulas RAW', values: [['=SUM(B1:B100)', '=AVERAGE(C1:C100)']] },
    { label: 'boolean flags', values: [[true, false, true, false]] },
  ];

  it.each(appendCases)('appends $label', ({ values }) => {
    const result = AppendRowsInputSchema.safeParse({
      spreadsheetId: '1Bxi',
      range: 'Ventas!A:E',
      values,
    });
    expect(result.success).toBe(true);
  });

  const insertOptions = ['INSERT_ROWS', 'OVERWRITE'] as const;
  it.each(insertOptions)('accepts insertDataOption=%s', (opt) => {
    const result = AppendRowsInputSchema.safeParse({
      spreadsheetId: '1Bxi',
      range: 'Sheet1!A:A',
      values: [['row']],
      insertDataOption: opt,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.insertDataOption).toBe(opt);
  });
});

// ─── SheetData matrix ─────────────────────────────────────────────────────────

describe('SheetDataSchema matrix', () => {
  const validData: Array<{ label: string; data: unknown }> = [
    {
      label: 'LatAm payment data',
      data: {
        range: 'Pagos!A1:E100',
        majorDimension: 'ROWS',
        values: [
          ['PAY-001', '15000.50', 'ARS', 'approved', '2024-01-15'],
          ['PAY-002', '8500.75', 'BRL', 'pending', '2024-01-16'],
        ],
      },
    },
    {
      label: 'AFIP comprobantes',
      data: {
        range: 'AFIP!A1:F10',
        values: [
          ['FC-A-00001-00000001', '30-11223344-5', 15000.5, 21.0, 'approved', true],
        ],
      },
    },
    {
      label: 'empty sheet',
      data: { range: 'Sheet1!A1:Z100', values: [] },
    },
    {
      label: 'single cell',
      data: { range: 'Sheet1!A1', values: [['value']] },
    },
    {
      label: 'all null row',
      data: { range: 'Sheet1!A1:D1', values: [[null, null, null, null]] },
    },
    {
      label: 'mixed types per column',
      data: {
        range: 'Sheet1!A1:B3',
        values: [['text', 42], [true, 15000.50], [null, false]],
      },
    },
    {
      label: 'large dataset',
      data: {
        range: 'Sheet1!A1:Z1000',
        values: Array.from({ length: 100 }, (_, i) => Array.from({ length: 5 }, (_, j) => `${i}-${j}`)),
      },
    },
  ];

  it.each(validData)('validates $label', ({ data }) => {
    expect(SheetDataSchema.safeParse(data).success).toBe(true);
  });
});

// ─── SpreadsheetSchema matrix ─────────────────────────────────────────────────

describe('SpreadsheetSchema matrix', () => {
  const latamSpreadsheets = [
    {
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      title: 'Ventas Argentina 2024',
      locale: 'es_AR',
      timeZone: 'America/Argentina/Buenos_Aires',
      sheets: [
        { sheetId: 0, title: 'Enero', index: 0 },
        { sheetId: 1, title: 'Febrero', index: 1 },
      ],
    },
    {
      spreadsheetId: '2CxjNWt1YSB6gNLLvCeBajhneVrqsvmct85PhwFf3ob',
      title: 'Notas Fiscais Brasil 2024',
      locale: 'pt_BR',
      timeZone: 'America/Sao_Paulo',
      sheets: [{ sheetId: 0, title: 'NF-e', index: 0 }],
    },
    {
      spreadsheetId: '3DykOXu2ZTC7hOMOwDfCbkiofWsrtwndu96QixGg4pc',
      title: 'CFDI México 2024',
      locale: 'es_MX',
      timeZone: 'America/Mexico_City',
      sheets: [
        { sheetId: 0, title: 'Facturas', index: 0, rowCount: 10000, columnCount: 26 },
        { sheetId: 1, title: 'Pagos', index: 1, rowCount: 5000, columnCount: 10 },
        { sheetId: 2, title: 'Notas Crédito', index: 2 },
      ],
    },
    {
      spreadsheetId: 'minimal',
      title: 'Test',
      sheets: [{ sheetId: 0, title: 'Sheet1', index: 0 }],
    },
    {
      spreadsheetId: '5FzmQZw4BVE9jPPRyFiEcmkhqYutxwpfw18SzkJi6re',
      title: 'DTE Chile',
      locale: 'es_CL',
      timeZone: 'America/Santiago',
      sheets: Array.from({ length: 12 }, (_, i) => ({ sheetId: i, title: `Mes ${i + 1}`, index: i })),
    },
  ];

  it.each(latamSpreadsheets)('validates spreadsheet: $title', (spreadsheet) => {
    expect(SpreadsheetSchema.safeParse(spreadsheet).success).toBe(true);
  });

  const invalidSpreadsheetsources = [
    {},
    { title: 'No ID', sheets: [] },
    { spreadsheetId: 'id', sheets: [] },
    { spreadsheetId: 'id', title: 'No sheets' },
    null,
  ];

  it.each(invalidSpreadsheetsources)('rejects invalid: %j', (input) => {
    expect(SpreadsheetSchema.safeParse(input).success).toBe(false);
  });
});
