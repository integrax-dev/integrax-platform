import type { ConnectorManifest } from '@integrax/connector-sdk';

/**
 * Payway (Prisma Medios de Pago) — Argentina
 *
 * Capabilities: create/capture/refund/cancel payments, tokenize cards.
 * Does NOT support subscriptions or QR payments.
 * Two-step auth+capture flow is supported.
 */
const manifest = {
  service: 'payway',

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
    authorize_payment: true,   // two-step: auth only
    capture_payment: true,     // two-step: capture after auth
    refund_payment: true,
    cancel_payment: true,
    tokenize_card: true,       // via Payway.js token
    get_payment: true,
  },

  entities: {
    payment: {
      source: 'payments',
      identity: {
        primary: ['id'],
        fallback: ['external_reference'],
      },
      fields: {
        externalId:          'id',
        amount:              'amount',
        currency:            'currency',
        status:              'status',
        authorizationCode:   'authorization_code',
        cardToken:           'card_token',
        installments:        'installments',
        transactionReference: 'external_reference',
        updatedAt:           'date_last_updated',
      },
    },
  },

  drift: {
    endpoints: ['payments'],
  },
} satisfies ConnectorManifest;

export default manifest;
