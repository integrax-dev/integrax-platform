import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'google-sheets',

  auth: { type: 'oauth2' as const },

  operations: {
    getSpreadsheet: true,
    readRange: true,
    writeRange: true,
    appendRows: true,
    clearRange: true,
    createSpreadsheet: true,
    addSheet: true,
  },

  entities: {
    /**
     * A "row" entity represents a single data row in a sheet.
     * Identity uses spreadsheetId + range + row index.
     * The row entity is generic — schema is inferred at runtime.
     */
    row: {
      source: 'values',
      identity: {
        primary: ['__spreadsheetId', '__sheetName', '__rowIndex'],
        fallback: ['__spreadsheetId', '__range'],
      },
      fields: {
        externalId: '__rowIndex',
        sku: '__rowIndex',
        title: '__spreadsheetId',
        price: '',
        currency: '',
        stock: '',
        status: '',
        updatedAt: '',
      },
    },
  },

  drift: {
    // Google Sheets does not expose push webhooks — drift via polling
    endpoints: [],
  },

} satisfies ConnectorManifest;

export default manifest;
