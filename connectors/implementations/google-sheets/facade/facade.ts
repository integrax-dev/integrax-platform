/**
 * Google Sheets Facade
 *
 * Wraps GoogleSheetsConnector behind the stable ConnectorFacade interface.
 * "row" is the canonical entity — each row in a sheet is addressable by
 * its spreadsheetId + sheetName + rowIndex (1-based).
 */

import type { ConnectorFacade } from '@integrax/connector-sdk';
import { GoogleSheetsConnector } from '../src/connector.js';

class GoogleSheetsFacade implements ConnectorFacade {
  private readonly connector: GoogleSheetsConnector;
  private readonly credentials: Record<string, string>;
  private readonly tenantId: string;

  constructor(credentials: Record<string, string>, tenantId: string) {
    this.connector = new GoogleSheetsConnector();
    this.credentials = credentials;
    this.tenantId = tenantId;
  }

  async execute(operation: string, input: Record<string, unknown>): Promise<unknown> {
    const result = await this.connector.executeAction({
      actionId: operation,
      params: input,
      context: { correlationId: `facade-${Date.now()}`, tenantId: this.tenantId },
      credentials: this.credentials,
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? `Google Sheets action '${operation}' failed`);
    }
    return result.data;
  }

  async listEntities(entity: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
    if (entity !== 'row') {
      throw new Error(`Google Sheets: listEntities — unsupported entity '${entity}'`);
    }
    const result = await this.execute('read_range', params) as { values?: unknown[][] };
    return result.values ?? [];
  }

  async getEntity(entity: string, id: string): Promise<unknown> {
    if (entity !== 'row') {
      throw new Error(`Google Sheets: getEntity — unsupported entity '${entity}'`);
    }
    // id format: "<spreadsheetId>!<sheetName>!<A1notation>"
    const [spreadsheetId, , range] = id.split('!');
    return this.execute('read_range', { spreadsheetId, range });
  }

  async updateEntity(entity: string, id: string, patch: Record<string, unknown>): Promise<unknown> {
    if (entity !== 'row') {
      throw new Error(`Google Sheets: updateEntity — unsupported entity '${entity}'`);
    }
    const [spreadsheetId, , range] = id.split('!');
    return this.execute('write_range', { spreadsheetId, range, values: patch['values'], ...patch });
  }
}

export function createGoogleSheetsFacade(
  credentials: Record<string, string>,
  tenantId: string,
): ConnectorFacade {
  return new GoogleSheetsFacade(credentials, tenantId);
}
