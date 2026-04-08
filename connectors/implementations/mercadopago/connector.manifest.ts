import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'mercadopago',

  auth: { type: 'api_key' as const },

  capabilities: ['read', 'write', 'webhook_inbound', 'polling'] as const,

  webhooks_supported: true,
  polling_supported: true,
  cursor_fields: ['date_last_updated', 'date_created'],
  entities_supported: ['payment'],

  operations: {
    get_payment: true,
    search_payments: true,
    refund_payment: true,
  },

  entities: {
    payment: {
      source: 'payments',
      identity: {
        primary: ['id'],
        fallback: ['external_reference'],
      },
      fields: {
        externalId: 'id',
        sku: 'external_reference',
        price: 'transaction_amount',
        currency: 'currency_id',
        stock: '',
        status: 'status',
        updatedAt: 'date_last_updated',
      },
    },
  },

  drift: {
    endpoints: ['payments'],
  },
} satisfies ConnectorManifest;

export default manifest;
