import { z } from 'zod';

// ============================================
// Authentication (OAuth2 or Service Account)
// ============================================

export const GoogleSheetsAuthSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('oauth2'),
    accessToken: z.string().min(1),
    refreshToken: z.string().optional(),
  }),
  z.object({
    type: z.literal('service_account'),
    serviceAccountKey: z.string().min(1, 'Service account JSON key is required'),
  }),
]);

export type GoogleSheetsAuth = z.infer<typeof GoogleSheetsAuthSchema>;

// ============================================
// Configuration
// ============================================

export const GoogleSheetsConfigSchema = z.object({
  /** Default spreadsheet ID to use */
  defaultSpreadsheetId: z.string().optional(),
});

export type GoogleSheetsConfig = z.infer<typeof GoogleSheetsConfigSchema>;

// ============================================
// Spreadsheet & Sheet Types
// ============================================

export const SpreadsheetSchema = z.object({
  spreadsheetId: z.string(),
  title: z.string(),
  locale: z.string().optional(),
  timeZone: z.string().optional(),
  sheets: z.array(z.object({
    sheetId: z.number(),
    title: z.string(),
    index: z.number(),
    rowCount: z.number().optional(),
    columnCount: z.number().optional(),
  })),
});

export type Spreadsheet = z.infer<typeof SpreadsheetSchema>;

export const SheetDataSchema = z.object({
  range: z.string(),
  majorDimension: z.enum(['ROWS', 'COLUMNS']).default('ROWS'),
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
});

export type SheetData = z.infer<typeof SheetDataSchema>;

// ============================================
// Action Inputs/Outputs
// ============================================

export const GetSpreadsheetInputSchema = z.object({
  spreadsheetId: z.string(),
});

export const ReadRangeInputSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string(),
  majorDimension: z.enum(['ROWS', 'COLUMNS']).default('ROWS'),
});

export const WriteRangeInputSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string(),
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  valueInputOption: z.enum(['RAW', 'USER_ENTERED']).default('USER_ENTERED'),
});

export const AppendRowsInputSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string(),
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  valueInputOption: z.enum(['RAW', 'USER_ENTERED']).default('USER_ENTERED'),
  insertDataOption: z.enum(['OVERWRITE', 'INSERT_ROWS']).default('INSERT_ROWS'),
});

export const ClearRangeInputSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string(),
});

export const CreateSpreadsheetInputSchema = z.object({
  title: z.string(),
  sheets: z.array(z.object({
    title: z.string(),
  })).optional(),
});

export const AddSheetInputSchema = z.object({
  spreadsheetId: z.string(),
  title: z.string(),
  rowCount: z.number().optional(),
  columnCount: z.number().optional(),
});

export const WriteResultSchema = z.object({
  spreadsheetId: z.string(),
  updatedRange: z.string(),
  updatedRows: z.number(),
  updatedColumns: z.number(),
  updatedCells: z.number(),
});

export const AppendResultSchema = z.object({
  spreadsheetId: z.string(),
  tableRange: z.string().optional(),
  updates: z.object({
    updatedRange: z.string(),
    updatedRows: z.number(),
    updatedColumns: z.number(),
    updatedCells: z.number(),
  }),
});

export type GetSpreadsheetInput = z.infer<typeof GetSpreadsheetInputSchema>;
export type ReadRangeInput = z.infer<typeof ReadRangeInputSchema>;
export type WriteRangeInput = z.infer<typeof WriteRangeInputSchema>;
export type AppendRowsInput = z.infer<typeof AppendRowsInputSchema>;
export type ClearRangeInput = z.infer<typeof ClearRangeInputSchema>;
export type CreateSpreadsheetInput = z.infer<typeof CreateSpreadsheetInputSchema>;
export type AddSheetInput = z.infer<typeof AddSheetInputSchema>;
export type WriteResult = z.infer<typeof WriteResultSchema>;
export type AppendResult = z.infer<typeof AppendResultSchema>;
