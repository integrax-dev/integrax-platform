import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'google-sheets',

  auth: { type: 'oauth2' as const },

  // Google Sheets no tiene webhooks push nativos: los cambios se detectan solo por polling.
  capabilities: ['read', 'write', 'polling', 'spreadsheet'] as const,

  webhooks_supported: false,
  polling_supported: true,
  // No hay cursor temporal nativo: el polling compara snapshots completos de filas.
  cursor_fields: [],
  entities_supported: ['row'],

  operations: {
    get_spreadsheet: true,
    read_range: true,
    write_range: true,
    append_rows: true,
    clear_range: true,
    create_spreadsheet: true,
    add_sheet: true,
  },

  entities: {
    /**
     * Una entidad "row" representa una fila de datos dentro de una hoja.
     * La identidad usa spreadsheetId + hoja + indice de fila.
     * La estructura es generica: el esquema se infiere en tiempo de ejecucion.
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
        title: '__sheetName',
        price: '',
        currency: '',
        stock: '',
        status: '',
        updatedAt: '',
      },
    },
  },

  drift: {
    // Google Sheets no expone webhooks push: el drift se detecta por polling.
    endpoints: [],
  },
} satisfies ConnectorManifest;

export default manifest;
