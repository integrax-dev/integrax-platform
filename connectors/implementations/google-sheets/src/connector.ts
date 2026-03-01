import { z } from 'zod';
import {
  BaseConnector,
  type ConnectorSpec,
  type TestConnectionResult,
  type ResolvedCredentials,
  type ActionContext,
  HttpClient,
  createHttpClient,
  NotFoundError,
  AuthenticationError,
} from '@integrax/connector-sdk';
import {
  GoogleSheetsAuthSchema,
  GoogleSheetsConfigSchema,
  GetSpreadsheetInputSchema,
  ReadRangeInputSchema,
  WriteRangeInputSchema,
  AppendRowsInputSchema,
  ClearRangeInputSchema,
  CreateSpreadsheetInputSchema,
  AddSheetInputSchema,
  SpreadsheetSchema,
  SheetDataSchema,
  WriteResultSchema,
  AppendResultSchema,
  type Spreadsheet,
  type SheetData,
  type GetSpreadsheetInput,
  type ReadRangeInput,
  type WriteRangeInput,
  type AppendRowsInput,
  type ClearRangeInput,
  type CreateSpreadsheetInput,
  type AddSheetInput,
  type WriteResult,
  type AppendResult,
} from './types.js';

const BASE_URL = 'https://sheets.googleapis.com/v4';

export class GoogleSheetsConnector extends BaseConnector {
  getSpec(): ConnectorSpec {
    return {
      metadata: {
        id: 'google-sheets',
        name: 'Google Sheets',
        description: 'Hojas de cálculo en la nube de Google',
        version: '1.0.0',
        category: 'storage',
        status: 'active',
        iconUrl: 'https://www.gstatic.com/images/branding/product/2x/sheets_2020q4_48dp.png',
        documentationUrl: 'https://developers.google.com/sheets/api',
      },
      authType: 'oauth2',
      authSchema: GoogleSheetsAuthSchema,
      configSchema: GoogleSheetsConfigSchema,
      actions: [
        {
          id: 'get_spreadsheet',
          name: 'Obtener spreadsheet',
          description: 'Obtiene metadata de un spreadsheet',
          inputSchema: GetSpreadsheetInputSchema,
          outputSchema: SpreadsheetSchema,
          idempotent: true,
        },
        {
          id: 'read_range',
          name: 'Leer rango',
          description: 'Lee valores de un rango de celdas',
          inputSchema: ReadRangeInputSchema,
          outputSchema: SheetDataSchema,
          idempotent: true,
        },
        {
          id: 'write_range',
          name: 'Escribir rango',
          description: 'Escribe valores en un rango de celdas',
          inputSchema: WriteRangeInputSchema,
          outputSchema: WriteResultSchema,
          idempotent: false,
        },
        {
          id: 'append_rows',
          name: 'Agregar filas',
          description: 'Agrega filas al final de una tabla',
          inputSchema: AppendRowsInputSchema,
          outputSchema: AppendResultSchema,
          idempotent: false,
        },
        {
          id: 'clear_range',
          name: 'Limpiar rango',
          description: 'Limpia los valores de un rango',
          inputSchema: ClearRangeInputSchema,
          outputSchema: z.object({ clearedRange: z.string() }),
          idempotent: false,
        },
        {
          id: 'create_spreadsheet',
          name: 'Crear spreadsheet',
          description: 'Crea un nuevo spreadsheet',
          inputSchema: CreateSpreadsheetInputSchema,
          outputSchema: SpreadsheetSchema,
          idempotent: false,
        },
        {
          id: 'add_sheet',
          name: 'Agregar hoja',
          description: 'Agrega una nueva hoja al spreadsheet',
          inputSchema: AddSheetInputSchema,
          outputSchema: z.object({
            sheetId: z.number(),
            title: z.string(),
          }),
          idempotent: false,
        },
      ],
    };
  }

  protected registerActions(): void {
    this.registerAction<GetSpreadsheetInput, Spreadsheet>(
      'get_spreadsheet',
      async (input, context) => this.getSpreadsheet(input, context)
    );

    this.registerAction<ReadRangeInput, SheetData>(
      'read_range',
      async (input, context) => this.readRange(input, context)
    );

    this.registerAction<WriteRangeInput, WriteResult>(
      'write_range',
      async (input, context) => this.writeRange(input, context)
    );

    this.registerAction<AppendRowsInput, AppendResult>(
      'append_rows',
      async (input, context) => this.appendRows(input, context)
    );

    this.registerAction<ClearRangeInput, { clearedRange: string }>(
      'clear_range',
      async (input, context) => this.clearRange(input, context)
    );

    this.registerAction<CreateSpreadsheetInput, Spreadsheet>(
      'create_spreadsheet',
      async (input, context) => this.createSpreadsheet(input, context)
    );

    this.registerAction<AddSheetInput, { sheetId: number; title: string }>(
      'add_sheet',
      async (input, context) => this.addSheet(input, context)
    );
  }

  async testConnection(
    credentials: ResolvedCredentials,
    config?: Record<string, unknown>
  ): Promise<TestConnectionResult> {
    const startTime = Date.now();

    try {
      const client = this.createClient(credentials);

      // Try to access the drive files list (minimal scope check)
      const response = await client.get<{ kind: string }>('/spreadsheets', {
        fields: 'kind',
      });

      return {
        success: true,
        testedAt: new Date(),
        latencyMs: Date.now() - startTime,
        details: {
          permissions: ['spreadsheets.readonly', 'spreadsheets'],
        },
      };
    } catch (error) {
      return {
        success: false,
        testedAt: new Date(),
        latencyMs: Date.now() - startTime,
        error: {
          code: 'AUTH_FAILED',
          message: error instanceof Error ? error.message : 'Authentication failed',
        },
      };
    }
  }

  private async getSpreadsheet(input: GetSpreadsheetInput, context: ActionContext): Promise<Spreadsheet> {
    const client = this.createClient(context.credentials);

    try {
      const response = await client.get<GoogleSpreadsheetResponse>(
        `/spreadsheets/${input.spreadsheetId}`,
        { fields: 'spreadsheetId,properties,sheets.properties' }
      );

      return {
        spreadsheetId: response.data.spreadsheetId,
        title: response.data.properties.title,
        locale: response.data.properties.locale,
        timeZone: response.data.properties.timeZone,
        sheets: response.data.sheets.map(s => ({
          sheetId: s.properties.sheetId,
          title: s.properties.title,
          index: s.properties.index,
          rowCount: s.properties.gridProperties?.rowCount,
          columnCount: s.properties.gridProperties?.columnCount,
        })),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        throw new NotFoundError('Spreadsheet', input.spreadsheetId);
      }
      throw error;
    }
  }

  private async readRange(input: ReadRangeInput, context: ActionContext): Promise<SheetData> {
    const client = this.createClient(context.credentials);

    const response = await client.get<GoogleValuesResponse>(
      `/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}?majorDimension=${input.majorDimension || 'ROWS'}`
    );

    return {
      range: response.data.range,
      majorDimension: response.data.majorDimension ?? 'ROWS',
      values: response.data.values ?? [],
    };
  }

  private async writeRange(input: WriteRangeInput, context: ActionContext): Promise<WriteResult> {
    const client = this.createClient(context.credentials);

    const response = await client.put<GoogleUpdateResponse>(
      `/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}?valueInputOption=${input.valueInputOption || 'USER_ENTERED'}`,
      { values: input.values }
    );

    return {
      spreadsheetId: response.data.spreadsheetId,
      updatedRange: response.data.updatedRange,
      updatedRows: response.data.updatedRows,
      updatedColumns: response.data.updatedColumns,
      updatedCells: response.data.updatedCells,
    };
  }

  private async appendRows(input: AppendRowsInput, context: ActionContext): Promise<AppendResult> {
    const client = this.createClient(context.credentials);

    const response = await client.post<GoogleAppendResponse>(
      `/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}:append?valueInputOption=${input.valueInputOption || 'USER_ENTERED'}&insertDataOption=${input.insertDataOption || 'INSERT_ROWS'}`,
      { values: input.values }
    );

    return {
      spreadsheetId: response.data.spreadsheetId,
      tableRange: response.data.tableRange,
      updates: {
        updatedRange: response.data.updates.updatedRange,
        updatedRows: response.data.updates.updatedRows,
        updatedColumns: response.data.updates.updatedColumns,
        updatedCells: response.data.updates.updatedCells,
      },
    };
  }

  private async clearRange(input: ClearRangeInput, context: ActionContext): Promise<{ clearedRange: string }> {
    const client = this.createClient(context.credentials);

    const response = await client.post<{ clearedRange: string }>(
      `/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}:clear`,
      {}
    );

    return { clearedRange: response.data.clearedRange };
  }

  private async createSpreadsheet(input: CreateSpreadsheetInput, context: ActionContext): Promise<Spreadsheet> {
    const client = this.createClient(context.credentials);

    const body: Record<string, unknown> = {
      properties: { title: input.title },
    };

    if (input.sheets?.length) {
      body.sheets = input.sheets.map(s => ({
        properties: { title: s.title },
      }));
    }

    const response = await client.post<GoogleSpreadsheetResponse>('/spreadsheets', body);

    return {
      spreadsheetId: response.data.spreadsheetId,
      title: response.data.properties.title,
      locale: response.data.properties.locale,
      timeZone: response.data.properties.timeZone,
      sheets: response.data.sheets.map(s => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        index: s.properties.index,
        rowCount: s.properties.gridProperties?.rowCount,
        columnCount: s.properties.gridProperties?.columnCount,
      })),
    };
  }

  private async addSheet(input: AddSheetInput, context: ActionContext): Promise<{ sheetId: number; title: string }> {
    const client = this.createClient(context.credentials);

    const body = {
      requests: [
        {
          addSheet: {
            properties: {
              title: input.title,
              gridProperties: {
                rowCount: input.rowCount ?? 1000,
                columnCount: input.columnCount ?? 26,
              },
            },
          },
        },
      ],
    };

    const response = await client.post<{ replies: Array<{ addSheet: { properties: { sheetId: number; title: string } } }> }>(
      `/spreadsheets/${input.spreadsheetId}:batchUpdate`,
      body
    );

    const addedSheet = response.data.replies[0].addSheet.properties;

    return {
      sheetId: addedSheet.sheetId,
      title: addedSheet.title,
    };
  }

  private createClient(credentials: ResolvedCredentials): HttpClient {
    const accessToken = credentials.accessToken ?? credentials.access_token;

    if (!accessToken) {
      throw new AuthenticationError('Missing access token');
    }

    return createHttpClient({
      baseUrl: BASE_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 30000,
      retries: 3,
    });
  }
}

// Google API response types
interface GoogleSpreadsheetResponse {
  spreadsheetId: string;
  properties: {
    title: string;
    locale?: string;
    timeZone?: string;
  };
  sheets: Array<{
    properties: {
      sheetId: number;
      title: string;
      index: number;
      gridProperties?: {
        rowCount?: number;
        columnCount?: number;
      };
    };
  }>;
}

interface GoogleValuesResponse {
  range: string;
  majorDimension?: 'ROWS' | 'COLUMNS';
  values?: Array<Array<string | number | boolean | null>>;
}

interface GoogleUpdateResponse {
  spreadsheetId: string;
  updatedRange: string;
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
}

interface GoogleAppendResponse {
  spreadsheetId: string;
  tableRange?: string;
  updates: {
    updatedRange: string;
    updatedRows: number;
    updatedColumns: number;
    updatedCells: number;
  };
}
