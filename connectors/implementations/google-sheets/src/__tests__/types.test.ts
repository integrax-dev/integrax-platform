import { describe, it, expect } from 'vitest';
import {
  GoogleSheetsAuthSchema,
  GoogleSheetsConfigSchema,
  SpreadsheetSchema,
  SheetDataSchema,
  GetSpreadsheetInputSchema,
  ReadRangeInputSchema,
  WriteRangeInputSchema,
  AppendRowsInputSchema,
  ClearRangeInputSchema,
  CreateSpreadsheetInputSchema,
  AddSheetInputSchema,
  WriteResultSchema,
  AppendResultSchema,
} from '../types.js';

describe('GoogleSheetsAuthSchema', () => {
  it('should validate OAuth2 auth', () => {
    const result = GoogleSheetsAuthSchema.safeParse({
      type: 'oauth2',
      accessToken: 'ya29.a0AfH6SMB...',
      refreshToken: '1//0gY...',
    });

    expect(result.success).toBe(true);
  });

  it('should validate OAuth2 without refresh token', () => {
    const result = GoogleSheetsAuthSchema.safeParse({
      type: 'oauth2',
      accessToken: 'ya29.a0AfH6SMB...',
    });

    expect(result.success).toBe(true);
  });

  it('should validate service account auth', () => {
    const result = GoogleSheetsAuthSchema.safeParse({
      type: 'service_account',
      serviceAccountKey: '{"type":"service_account","project_id":"..."}',
    });

    expect(result.success).toBe(true);
  });

  it('should reject empty access token for OAuth2', () => {
    const result = GoogleSheetsAuthSchema.safeParse({
      type: 'oauth2',
      accessToken: '',
    });

    expect(result.success).toBe(false);
  });

  it('should reject empty service account key', () => {
    const result = GoogleSheetsAuthSchema.safeParse({
      type: 'service_account',
      serviceAccountKey: '',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid auth type', () => {
    const result = GoogleSheetsAuthSchema.safeParse({
      type: 'invalid',
      accessToken: 'token',
    });

    expect(result.success).toBe(false);
  });
});

describe('GoogleSheetsConfigSchema', () => {
  it('should validate config with default spreadsheet', () => {
    const result = GoogleSheetsConfigSchema.safeParse({
      defaultSpreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    });

    expect(result.success).toBe(true);
  });

  it('should validate empty config', () => {
    const result = GoogleSheetsConfigSchema.safeParse({});

    expect(result.success).toBe(true);
  });
});

describe('SpreadsheetSchema', () => {
  it('should validate complete spreadsheet', () => {
    const result = SpreadsheetSchema.safeParse({
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      title: 'Mi Planilla de Ventas',
      locale: 'es_AR',
      timeZone: 'America/Argentina/Buenos_Aires',
      sheets: [
        {
          sheetId: 0,
          title: 'Ventas 2024',
          index: 0,
          rowCount: 1000,
          columnCount: 26,
        },
        {
          sheetId: 123456,
          title: 'Clientes',
          index: 1,
          rowCount: 500,
          columnCount: 10,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('should validate minimal spreadsheet', () => {
    const result = SpreadsheetSchema.safeParse({
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      title: 'Test',
      sheets: [
        {
          sheetId: 0,
          title: 'Sheet1',
          index: 0,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe('SheetDataSchema', () => {
  it('should validate sheet data with rows', () => {
    const result = SheetDataSchema.safeParse({
      range: 'Ventas!A1:D10',
      majorDimension: 'ROWS',
      values: [
        ['Fecha', 'Cliente', 'Monto', 'Estado'],
        ['2024-01-15', 'Juan Pérez', 15000, true],
        ['2024-01-16', 'María García', 8500.50, false],
      ],
    });

    expect(result.success).toBe(true);
  });

  it('should validate sheet data with columns', () => {
    const result = SheetDataSchema.safeParse({
      range: 'Data!A:C',
      majorDimension: 'COLUMNS',
      values: [
        ['Header1', 'Value1', 'Value2'],
        ['Header2', 'Value3', 'Value4'],
      ],
    });

    expect(result.success).toBe(true);
  });

  it('should allow null values', () => {
    const result = SheetDataSchema.safeParse({
      range: 'Sheet1!A1:B2',
      values: [
        ['Name', null],
        [null, 100],
      ],
    });

    expect(result.success).toBe(true);
  });

  it('should default majorDimension to ROWS', () => {
    const result = SheetDataSchema.safeParse({
      range: 'Sheet1!A1:B2',
      values: [['a', 'b']],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.majorDimension).toBe('ROWS');
    }
  });
});

describe('GetSpreadsheetInputSchema', () => {
  it('should validate spreadsheet ID', () => {
    const result = GetSpreadsheetInputSchema.safeParse({
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    });

    expect(result.success).toBe(true);
  });

  it('should reject missing spreadsheet ID', () => {
    const result = GetSpreadsheetInputSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});

describe('ReadRangeInputSchema', () => {
  it('should validate complete read input', () => {
    const result = ReadRangeInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      range: 'Sheet1!A1:Z100',
      majorDimension: 'COLUMNS',
    });

    expect(result.success).toBe(true);
  });

  it('should default majorDimension to ROWS', () => {
    const result = ReadRangeInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      range: 'Sheet1!A1:Z100',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.majorDimension).toBe('ROWS');
    }
  });
});

describe('WriteRangeInputSchema', () => {
  it('should validate write input', () => {
    const result = WriteRangeInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      range: 'Ventas!A1:D1',
      values: [['Fecha', 'Cliente', 'Monto', 'Estado']],
      valueInputOption: 'USER_ENTERED',
    });

    expect(result.success).toBe(true);
  });

  it('should default valueInputOption to USER_ENTERED', () => {
    const result = WriteRangeInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      range: 'Sheet1!A1',
      values: [['test']],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valueInputOption).toBe('USER_ENTERED');
    }
  });

  it('should accept RAW input option', () => {
    const result = WriteRangeInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      range: 'Sheet1!A1',
      values: [['=SUM(B1:B10)']],
      valueInputOption: 'RAW',
    });

    expect(result.success).toBe(true);
  });
});

describe('AppendRowsInputSchema', () => {
  it('should validate append input', () => {
    const result = AppendRowsInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      range: 'Ventas!A:D',
      values: [
        ['2024-01-17', 'Carlos López', 12000, true],
      ],
    });

    expect(result.success).toBe(true);
  });

  it('should default insertDataOption to INSERT_ROWS', () => {
    const result = AppendRowsInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      range: 'Sheet1!A:A',
      values: [['new row']],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.insertDataOption).toBe('INSERT_ROWS');
    }
  });

  it('should accept OVERWRITE option', () => {
    const result = AppendRowsInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      range: 'Sheet1!A:A',
      values: [['overwrite']],
      insertDataOption: 'OVERWRITE',
    });

    expect(result.success).toBe(true);
  });
});

describe('ClearRangeInputSchema', () => {
  it('should validate clear input', () => {
    const result = ClearRangeInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      range: 'Sheet1!A1:Z100',
    });

    expect(result.success).toBe(true);
  });
});

describe('CreateSpreadsheetInputSchema', () => {
  it('should validate create with sheets', () => {
    const result = CreateSpreadsheetInputSchema.safeParse({
      title: 'Nueva Planilla de Ventas',
      sheets: [
        { title: 'Ventas' },
        { title: 'Clientes' },
        { title: 'Productos' },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('should validate create without sheets', () => {
    const result = CreateSpreadsheetInputSchema.safeParse({
      title: 'Simple Spreadsheet',
    });

    expect(result.success).toBe(true);
  });
});

describe('AddSheetInputSchema', () => {
  it('should validate add sheet with dimensions', () => {
    const result = AddSheetInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      title: 'Nueva Hoja',
      rowCount: 500,
      columnCount: 20,
    });

    expect(result.success).toBe(true);
  });

  it('should validate add sheet without dimensions', () => {
    const result = AddSheetInputSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      title: 'Nueva Hoja',
    });

    expect(result.success).toBe(true);
  });
});

describe('WriteResultSchema', () => {
  it('should validate write result', () => {
    const result = WriteResultSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      updatedRange: 'Sheet1!A1:D10',
      updatedRows: 10,
      updatedColumns: 4,
      updatedCells: 40,
    });

    expect(result.success).toBe(true);
  });
});

describe('AppendResultSchema', () => {
  it('should validate append result', () => {
    const result = AppendResultSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      tableRange: 'Sheet1!A1:D100',
      updates: {
        updatedRange: 'Sheet1!A101:D101',
        updatedRows: 1,
        updatedColumns: 4,
        updatedCells: 4,
      },
    });

    expect(result.success).toBe(true);
  });

  it('should allow missing tableRange', () => {
    const result = AppendResultSchema.safeParse({
      spreadsheetId: '1BxiMVs...',
      updates: {
        updatedRange: 'Sheet1!A1:D1',
        updatedRows: 1,
        updatedColumns: 4,
        updatedCells: 4,
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('Google Sheets Integration (real)', () => {
  const { GoogleSheetsConnector } = require('../index');
  const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  it('should connect and get spreadsheet info', async () => {
    if (!credentials || !spreadsheetId) {
      console.warn('Google Sheets integration test skipped: set GOOGLE_SHEETS_CREDENTIALS y GOOGLE_SHEETS_SPREADSHEET_ID');
      return;
    }
    const connector = new GoogleSheetsConnector({ credentials: JSON.parse(Buffer.from(credentials, 'base64').toString('utf8')) });
    let info = null;
    let error = null;
    try {
      info = await connector.getSpreadsheet({ spreadsheetId });
    } catch (err) {
      error = err;
    }
    if (error) {
      console.error('Google Sheets API error:', error);
    }
    expect(info).toBeDefined();
    expect(info.spreadsheetId).toBe(spreadsheetId);
  }, 15000);
});
