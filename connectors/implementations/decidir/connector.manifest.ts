import type { ConnectorManifest } from '@integrax/connector-sdk';

/**
 * Decidir (ICBC) — Argentina
 *
 * Capabilities: create/authorize/capture/refund/cancel payments, tokenize cards.
 * Full two-step auth+capture flow is the primary use case.
 * Does NOT support subscriptions, QR, or split payments.
 */
const manifest = {
  service: 'decidir',

  auth: { type: 'api_key' as const },

  capabilities: ['read', 'write', 'webhook_inbound', 'payments'] as const,

  webhooks_supported: true,
  polling_supported: false,
  cursor_fields: [],
  entities_supported: ['payment', 'refund'],

  payment_capabilities: [
    'create_payment',
    'authorize_payment',
    'capture_payment',
    'refund_payment',
    'cancel_payment',
    'tokenize_payment_method',
  ] as const,

  operations: {
    create_payment: true,
    authorize_payment: true,   // preauthorize
    capture_payment: true,     // capture after preauth
    refund_payment: true,      // full or partial
    cancel_payment: true,      // void / anular
    tokenize_card: true,       // via Decidir.js
    get_payment: true,
  },

  entities: {
    payment: {
      source: 'payments',
      identity: {
        primary: ['id'],
        fallback: ['merchant_payment_id'],
      },
      fields: {
        externalId:          'id',
        amount:              'amount',
        currency:            'currency',
        status:              'status',
        authorizationCode:   'establishment_name',
        transactionReference: 'merchant_payment_id',
        installments:        'installments',
        updatedAt:           'date',
      },
    },
  },

  drift: {
    endpoints: ['payments'],
  },
} satisfies ConnectorManifest;

export default manifest;
