/**
 * Connector Contracts
 *
 * Each connector's contract defines the endpoints and expected response schemas
 * that the contract tester will validate. Contracts serve as living documentation
 * of what the connector expects from the external API.
 */

import type { ConnectorContract } from './contract-tester.js';

// ─── MercadoPago ──────────────────────────────────────────────────────────────

export const MERCADOPAGO_CONTRACT: ConnectorContract = {
  connectorId: 'mercadopago',
  name: 'MercadoPago',
  baseUrl: 'https://api.mercadopago.com',
  auth: {
    headerName: 'Authorization',
    envVar: 'MERCADOPAGO_ACCESS_TOKEN',
  },
  endpoints: [
    {
      id: 'GET /v1/payment_methods',
      method: 'GET',
      path: '/v1/payment_methods',
      description: 'List available payment methods',
      expectedStatus: 200,
      responseSchema: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            payment_type_id: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
    {
      id: 'GET /v1/account/balance',
      method: 'GET',
      path: '/v1/account/balance',
      description: 'Get account balance',
      expectedStatus: 200,
      responseSchema: {
        type: 'object',
        required: ['available_balance'],
        properties: {
          available_balance: { type: 'number' },
          unavailable_balance: { type: 'number' },
          total: { type: 'number' },
        },
      },
    },
  ],
};

// ─── MercadoLibre ─────────────────────────────────────────────────────────────

export const MERCADOLIBRE_CONTRACT: ConnectorContract = {
  connectorId: 'mercadolibre',
  name: 'MercadoLibre',
  baseUrl: 'https://api.mercadolibre.com',
  auth: {
    headerName: 'Authorization',
    envVar: 'MERCADOLIBRE_ACCESS_TOKEN',
  },
  endpoints: [
    {
      id: 'GET /sites',
      method: 'GET',
      path: '/sites',
      description: 'List available sites',
      expectedStatus: 200,
      responseSchema: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    },
    {
      id: 'GET /categories/MLA1000',
      method: 'GET',
      path: '/categories/MLA1000',
      description: 'Get category details',
      expectedStatus: 200,
      responseSchema: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          path_from_root: { type: 'array' },
        },
      },
    },
  ],
};

// ─── AFIP ─────────────────────────────────────────────────────────────────────

export const AFIP_CONTRACT: ConnectorContract = {
  connectorId: 'afip-wsfe',
  name: 'AFIP WSFE',
  baseUrl: 'https://wswhomo.afip.gov.ar',
  endpoints: [
    {
      id: 'SOAP FEDummy',
      method: 'POST',
      path: '/wsfev1/service.asmx',
      description: 'Health check (FEDummy)',
      expectedStatus: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://ar.gov.afip.dif.FEV1/FEDummy',
      },
      responseSchema: {
        type: 'object',
        nullable: true,
      },
    },
  ],
};

// ─── Google Sheets ────────────────────────────────────────────────────────────

export const GOOGLE_SHEETS_CONTRACT: ConnectorContract = {
  connectorId: 'google-sheets',
  name: 'Google Sheets',
  baseUrl: 'https://sheets.googleapis.com',
  auth: {
    headerName: 'Authorization',
    envVar: 'GOOGLE_SHEETS_ACCESS_TOKEN',
  },
  endpoints: [
    {
      id: 'GET /v4/spreadsheets/{spreadsheetId}',
      method: 'GET',
      path: '/v4/spreadsheets/test-sheet-id',
      description: 'Get spreadsheet metadata',
      expectedStatus: 200,
      responseSchema: {
        type: 'object',
        required: ['spreadsheetId', 'properties'],
        properties: {
          spreadsheetId: { type: 'string' },
          properties: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string' },
              locale: { type: 'string' },
            },
          },
        },
      },
    },
  ],
};

// ─── WhatsApp Business ────────────────────────────────────────────────────────

export const WHATSAPP_CONTRACT: ConnectorContract = {
  connectorId: 'whatsapp-business',
  name: 'WhatsApp Business',
  baseUrl: 'https://graph.facebook.com/v18.0',
  auth: {
    headerName: 'Authorization',
    envVar: 'WHATSAPP_TOKEN',
  },
  endpoints: [
    {
      id: 'GET /me',
      method: 'GET',
      path: '/me',
      description: 'Get account info',
      expectedStatus: 200,
      responseSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
  ],
};

// ─── Contabilium ──────────────────────────────────────────────────────────────

export const CONTABILIUM_CONTRACT: ConnectorContract = {
  connectorId: 'contabilium',
  name: 'Contabilium',
  baseUrl: 'https://app.contabilium.com/api',
  auth: {
    headerName: 'Authorization',
    envVar: 'CONTABILIUM_API_KEY',
  },
  endpoints: [
    {
      id: 'GET /rest/conceptos',
      method: 'GET',
      path: '/rest/conceptos',
      description: 'List concepts/products',
      expectedStatus: 200,
      responseSchema: {
        type: 'object',
        nullable: true,
        properties: {
          Items: { type: 'array' },
          TotalItems: { type: 'number' },
        },
      },
    },
  ],
};

// ─── Shopify ──────────────────────────────────────────────────────────────────

export const SHOPIFY_CONTRACT: ConnectorContract = {
  connectorId: 'shopify',
  name: 'Shopify',
  baseUrl: 'https://example.myshopify.com/admin/api/2024-01',
  auth: {
    headerName: 'X-Shopify-Access-Token',
    envVar: 'SHOPIFY_ACCESS_TOKEN',
  },
  endpoints: [
    {
      id: 'GET /products.json',
      method: 'GET',
      path: '/products.json?limit=1',
      description: 'List products',
      expectedStatus: 200,
      responseSchema: {
        type: 'object',
        required: ['products'],
        properties: {
          products: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'title'],
              properties: {
                id: { type: 'number' },
                title: { type: 'string' },
                status: { type: 'string', enum: ['active', 'draft', 'archived'] },
              },
            },
          },
        },
      },
    },
  ],
};

// ─── Tiendanube ───────────────────────────────────────────────────────────────

export const TIENDANUBE_CONTRACT: ConnectorContract = {
  connectorId: 'tiendanube',
  name: 'Tiendanube',
  baseUrl: 'https://api.tiendanube.com/v1',
  auth: {
    headerName: 'Authentication',
    envVar: 'TIENDANUBE_ACCESS_TOKEN',
  },
  endpoints: [
    {
      id: 'GET /{store_id}/products',
      method: 'GET',
      path: '/1/products',
      description: 'List products',
      expectedStatus: 200,
      responseSchema: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'number' },
            name: { type: 'object' },
          },
        },
      },
    },
  ],
};

// ─── All contracts registry ───────────────────────────────────────────────────

export const ALL_CONTRACTS: ConnectorContract[] = [
  MERCADOPAGO_CONTRACT,
  MERCADOLIBRE_CONTRACT,
  AFIP_CONTRACT,
  GOOGLE_SHEETS_CONTRACT,
  WHATSAPP_CONTRACT,
  CONTABILIUM_CONTRACT,
  SHOPIFY_CONTRACT,
  TIENDANUBE_CONTRACT,
];

export const CONTRACT_MAP = new Map<string, ConnectorContract>(
  ALL_CONTRACTS.map(c => [c.connectorId, c])
);
