import type { ConnectorManifest } from '@integrax/connector-sdk';

const manifest = {
  service: 'mercadopago',

  auth: { type: 'api_key' as const },

  operations: {
    getPayment: true,
    searchPayments: true,
    createPayment: true,
    refundPayment: true,
    getOrder: true,
    searchOrders: true,
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
        stock: '',        // not applicable for payments
        status: 'status',
        updatedAt: 'date_last_updated',
      },
    },

    order: {
      source: 'merchant_orders',
      identity: {
        primary: ['id'],
        fallback: ['external_reference'],
      },
      fields: {
        externalId: 'id',
        sku: 'external_reference',
        price: 'total_amount',
        currency: 'currency_id',
        stock: '',
        status: 'status',
        updatedAt: 'date_last_updated',
      },
    },

    product: {
      source: 'items',
      identity: {
        primary: ['id'],
        fallback: ['title'],
      },
      fields: {
        externalId: 'id',
        sku: 'id',
        title: 'title',
        price: 'unit_price',
        currency: 'currency_id',
        stock: 'available_quantity',
        status: 'status',
        updatedAt: 'date_created',
      },
    },
  },

  drift: {
    endpoints: ['payments', 'merchant_orders', 'items'],
  },

} satisfies ConnectorManifest;

export default manifest;
